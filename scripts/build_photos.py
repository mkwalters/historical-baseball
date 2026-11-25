"""Build data/photos.json — historical photos for each franchise, from Wikipedia.

For every franchise we look up a hand-picked list of famous moments and ballparks,
plus the World Series articles for every pennant it won, and keep the lead image of
each article **only if it is hosted on Wikimedia Commons** (i.e. freely licensed;
most pre-1929 photos are public domain). Logos/SVGs are skipped. On top of that,
SCRAPBOOK (scripts/scrapbook_picks.py) lists Commons files picked by hand for each club.

Legends get a Commons portrait **in the club's uniform**: the Wikipedia lead photo when it
is one, else the file in LEGEND_PHOTOS, else nothing (the page then uses MLB's headshot,
which is always in uniform). Every ballpark the club called home gets its Wikipedia
photo and a short description.

Usage: python3 scripts/build_photos.py
"""
import concurrent.futures as cf, hashlib, json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.join(os.path.dirname(__file__), "..")
CACHE = os.environ.get("DTM_CACHE", os.path.join(ROOT, ".cache"))
os.makedirs(CACHE, exist_ok=True)
UA = {"User-Agent": "DugoutTimeMachine/0.1 (personal non-commercial baseball history prototype)"}

# Article titles shown under a friendlier name: {article: (title, caption)}.
RETITLE = {
    "Merkle's Boner": ("Fred Merkle", "Rookie Fred Merkle of the New York Giants made a notorious base-running mistake "
                                      "in a game against the Chicago Cubs on September 23, 1908."),
}

# (article title, year or None). Titles that don't resolve or lack a free image are skipped.
MOMENTS = {
    109: [("Chase Field", 1998)],
    133: [("Columbia Park (Philadelphia)", 1901), ("Connie Mack", None), ("$100,000 infield", 1911), ("Shibe Park", 1909), ("Oakland Coliseum", 1968)],
    144: [("South End Grounds", 1890), ("1914 Boston Braves season", 1914), ("Braves Field", 1915), ("Milwaukee County Stadium", 1953), ("Atlanta–Fulton County Stadium", 1966)],
    110: [("Sportsman's Park", 1909), ("Eddie Gaedel", 1951), ("Memorial Stadium (Baltimore)", 1954), ("Oriole Park at Camden Yards", 1992)],
    111: [("Huntington Avenue Grounds", 1903), ("Royal Rooters", 1903), ("Fenway Park", 1912), ("Green Monster", None)],
    112: [("West Side Park", 1906), ("Tinker to Evers to Chance", 1906), ("Wrigley Field", 1916), ("Babe Ruth's called shot", 1932)],
    145: [("South Side Park", 1906), ("Hitless Wonders", 1906), ("Comiskey Park", 1910), ("Black Sox Scandal", 1919)],
    113: [("Cincinnati Red Stockings", 1869), ("Palace of the Fans", 1902), ("Crosley Field", 1912), ("Riverfront Stadium", 1970), ("Big Red Machine", 1975)],
    114: [("League Park", 1910), ("Ray Chapman", 1920), ("Cleveland Stadium", 1932), ("Larry Doby", 1947), ("Satchel Paige", 1948)],
    115: [("Mile High Stadium", 1993), ("Coors Field", 1995)],
    116: [("Bennett Park (Detroit)", 1901), ("Tiger Stadium", 1912)],
    117: [("Colt Stadium", 1962), ("Astrodome", 1965)],
    118: [("Municipal Stadium (Kansas City)", 1969), ("Kauffman Stadium", 1973), ("Pine Tar Incident", 1983)],
    108: [("Wrigley Field (Los Angeles)", 1961), ("Angel Stadium", 1966)],
    119: [("Washington Park (Brooklyn)", 1898), ("Ebbets Field", 1913), ("Jackie Robinson", 1947), ("Los Angeles Memorial Coliseum", 1958), ("Dodger Stadium", 1962)],
    146: [("Hard Rock Stadium", 1993), ("LoanDepot Park", 2012)],
    158: [("Seattle Pilots", 1969), ("Sick's Stadium", 1969), ("Milwaukee County Stadium", 1970)],
    142: [("Griffith Stadium", 1911), ("Walter Johnson", 1924), ("Metropolitan Stadium", 1961), ("Hubert H. Humphrey Metrodome", 1982)],
    121: [("Polo Grounds", 1962), ("Shea Stadium", 1964), ("Citi Field", 2009)],
    147: [("Hilltop Park", 1903), ("Yankee Stadium (1923)", 1923), ("Murderers' Row (baseball)", 1927), ("Lou Gehrig's farewell speech", 1939), ("Don Larsen's perfect game", 1956)],
    143: [("Baker Bowl", 1895), ("Whiz Kids (baseball)", 1950), ("Connie Mack Stadium", 1938), ("Veterans Stadium", 1971)],
    134: [("Exposition Park (Pittsburgh)", 1901), ("Forbes Field", 1909), ("Three Rivers Stadium", 1970)],
    135: [("San Diego Stadium", 1969), ("Petco Park", 2004)],
    137: [("Polo Grounds", 1911), ("Merkle's Boner", 1908), ("Shot Heard 'Round the World (baseball)", 1951), ("The Catch (baseball)", 1954), ("Seals Stadium", 1958), ("Candlestick Park", 1960)],
    136: [("Kingdome", 1977), ("T-Mobile Park", 1999)],
    138: [("Robison Field", 1893), ("Sportsman's Park", 1920), ("Gashouse Gang", 1934), ("Busch Memorial Stadium", 1966)],
    139: [("Tropicana Field", 1998)],
    140: [("RFK Stadium", 1962), ("Arlington Stadium", 1972), ("Globe Life Park in Arlington", 1994)],
    141: [("Exhibition Stadium", 1977), ("Rogers Centre", 1989)],
    120: [("Jarry Park Stadium", 1969), ("Olympic Stadium (Montreal)", 1977), ("Nationals Park", 2008)],
}
BAD = re.compile(r"(logo|wordmark|insignia|emblem|\.svg|uniform|cap_|jersey|map|locator|flag)", re.I)


def fetch(url):
    f = os.path.join(CACHE, "w_" + hashlib.md5(url.encode()).hexdigest() + ".json")
    if os.path.exists(f):
        with open(f) as fh:
            return json.load(fh)
    if os.environ.get("DTM_OFFLINE"):  # build from whatever is cached; skip the network
        return {}
    d = None
    for attempt in range(6):
        time.sleep(0.25)  # stay well under Wikimedia's rate limits
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                d = json.load(r)
            break
        except urllib.error.HTTPError as e:
            if e.code == 404:
                d = {"_status": 404}
                break
            wait = e.headers.get("Retry-After")
            time.sleep(float(wait) if wait and wait.isdigit() else 3 * (attempt + 1))
        except Exception:
            time.sleep(3 * (attempt + 1))
    if d is None:  # transient failure: don't cache, so a re-run retries it
        print("FAIL", url, file=sys.stderr)
        return {}
    with open(f, "w") as fh:
        json.dump(d, fh)
    return d


def summary(title):
    return fetch("https://en.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(title.replace(" ", "_"), safe=""))


def commons_image(s):
    """Return {src, thumb, file} for a Commons-hosted, non-logo lead image, else None."""
    img = s.get("originalimage") or {}
    src = img.get("source", "").split("?")[0]
    if "/wikipedia/commons/" not in src or BAD.search(src):
        return None
    # Either upload.wikimedia.org/wikipedia/commons/a/ab/Name or (newer API) a thumbnail URL:
    # thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Name/3840px-Name
    m = (re.match(r"https://upload\.wikimedia\.org/wikipedia/commons/(\w)/(\w\w)/([^/]+)$", src)
         or re.match(r"https://(?:upload|thumb)\.wikimedia\.org/wikipedia/commons/thumb/(\w)/(\w\w)/([^/]+)/[^/]+$", src))
    if not m:
        return None
    a, ab, name = m.groups()
    base = "https://upload.wikimedia.org/wikipedia/commons"
    thumb = src if img.get("width", 0) <= 960 else f"{base}/thumb/{a}/{ab}/{name}/960px-{name}"
    if name.lower().endswith((".tif", ".tiff")):
        thumb = f"{base}/thumb/{a}/{ab}/{name}/lossy-page1-960px-{name}.jpg"
    return {"src": thumb, "file": "https://commons.wikimedia.org/wiki/File:" + name, "w": img.get("width"), "h": img.get("height")}


def first_sentences(text, n=230):
    text = re.sub(r"\s+", " ", text or "").strip()
    if len(text) <= n:
        return text
    cut = text[:n]
    dot = cut.rfind(". ")
    return cut[: dot + 1] if dot > 80 else cut.rsplit(" ", 1)[0] + "…"


def archive_item(title, year):
    s = summary(title)
    im = commons_image(s)
    if not im:
        return None
    name, caption = RETITLE.get(title, (s.get("title", title), first_sentences(s.get("extract"))))
    return {"title": name, "year": year, "caption": caption,
            "url": (s.get("content_urls") or {}).get("desktop", {}).get("page"), **im}


TITLE_VARIANTS = ["{}", "{} (baseball)", "{} (baseball player)", "{} (pitcher)", "{} (outfielder)",
                  "{} (catcher)", "{} (infielder)", "{} (first baseman)", "{} (shortstop)",
                  "{} (second baseman)", "{} (third baseman)", "{} (designated hitter)"]


def same_birth_year(s, born):
    """True unless the article states a different birth year ("born 1963", "(1895–1948)")."""
    text = (s.get("description") or "") + " " + (s.get("extract") or "")[:400]
    if born in text:
        return True
    stated = re.findall(r"(?:born\s|\()(1[89]\d\d|20[01]\d)", text)
    return not stated


def legend_photo(name, born=""):
    # Wikipedia's search API rate-limits anonymous clients hard, so probe likely titles via REST.
    for pattern in TITLE_VARIANTS:
        s = summary(pattern.format(name))
        if s.get("_status") == 404 or not s.get("title"):
            continue
        text = ((s.get("description") or "") + " " + (s.get("extract") or "")[:300]).lower()
        if s.get("type") == "disambiguation" or "baseball" not in text:
            continue
        if born and not same_birth_year(s, born):
            continue  # same name, different person
        im = commons_image(s)
        return ({**im, "url": (s.get("content_urls") or {}).get("desktop", {}).get("page")} if im else None)
    return None


COMMONS_API = "https://commons.wikimedia.org/w/api.php?"
LEGEND_CARDS = 10  # the Legends chapter shows ten cards


def commons_files(titles):
    """Resolve Commons file titles -> {title: {src, file, w, h, desc}} (batched, cached)."""
    out = {}
    titles = list(dict.fromkeys(titles))
    for i in range(0, len(titles), 40):
        params = {"action": "query", "format": "json", "formatversion": "2", "titles": "|".join(titles[i:i + 40]),
                  "prop": "imageinfo", "iiprop": "url|size|extmetadata", "iiurlwidth": "960",
                  "iiextmetadatafilter": "ImageDescription|DateTimeOriginal"}
        d = fetch(COMMONS_API + urllib.parse.urlencode(params))
        norm = {n["to"]: n["from"] for n in (d.get("query") or {}).get("normalized", [])}
        for pg in (d.get("query") or {}).get("pages", []):
            ii = (pg.get("imageinfo") or [None])[0]
            if not ii:
                print("missing on Commons:", pg.get("title"), file=sys.stderr)
                continue
            desc = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", ((ii.get("extmetadata") or {}).get("ImageDescription") or {}).get("value", ""))).strip()
            src = ii.get("thumburl") or ii["url"]
            out[norm.get(pg["title"], pg["title"])] = {"src": src, "file": ii.get("descriptionurl"), "w": ii.get("width"), "h": ii.get("height"), "desc": desc}
    return out


def clean_desc(d):
    """A Commons description as a caption, minus library catalog boilerplate."""
    if re.search(r"negative : (glass|nitrate)|Abstract/medium|Bain News Service|Digital ID|Collection Name|DSCF|Original data", d or ""):
        return ""
    return first_sentences(d, 300)


def park_item(title):
    s = summary(title)
    if not s.get("title") or s.get("type") == "disambiguation":
        print("no park article:", title, file=sys.stderr)
        return None
    im = commons_image(s) or {}
    return {"src": im.get("src"), "file": im.get("file"), "blurb": first_sentences(s.get("extract"), 320),
            "url": (s.get("content_urls") or {}).get("desktop", {}).get("page")}


def main():
    from scrapbook_picks import SCRAPBOOK, LEGEND_PHOTOS, PARK_TITLES, PARK_PHOTOS, FACE_PHOTOS, PHOTO_FOCUS

    def pick(tid, pid):
        """A curated portrait: (team, player) first, for players who starred for two clubs, then player."""
        return LEGEND_PHOTOS.get((int(tid), pid), LEGEND_PHOTOS.get(pid, "keep"))
    champs = json.load(open(os.path.join(ROOT, "data", "champions.json")))
    legends = json.load(open(os.path.join(ROOT, "data", "legends.json")))
    jobs = {}
    for tid, items in MOMENTS.items():
        lst = list(items)
        for y, c in champs.items():
            if tid in (c["winner"]["id"], c["loser"]["id"]):
                lst.append((f"{y} World Series", int(y)))
        jobs[tid] = lst
    out = {}
    with cf.ThreadPoolExecutor(2) as ex:
        for tid, lst in jobs.items():
            items = [x for x in ex.map(lambda a: archive_item(*a), lst) if x]
            seen, uniq = set(), []
            for it in items:
                if it["src"] not in seen:
                    seen.add(it["src"]); uniq.append(it)
            uniq.sort(key=lambda x: (x["year"] is None, x["year"] or 0))
            out[str(tid)] = {"archive": uniq, "legends": {}}
        names = [(tid, p["id"], p["name"], p.get("born", "")) for tid, ps in legends.items() for p in ps[:LEGEND_CARDS]]
        for (tid, pid, _, _), ph in zip(names, ex.map(lambda a: legend_photo(a[2], a[3]) if pick(a[0], a[1]) == "keep" else None, names)):
            if ph:
                out.setdefault(tid, {"archive": [], "legends": {}})["legends"][str(pid)] = ph

    # hand-picked Commons files: scrapbook pages and in-uniform legend portraits
    files = commons_files([p[0] for picks in SCRAPBOOK.values() for p in picks] + [f for f in LEGEND_PHOTOS.values() if f]
                          + [f for f in PARK_PHOTOS.values() if isinstance(f, str)] + [f for f in FACE_PHOTOS.values() if f.startswith("File:")])
    for (tid, pid, _, _) in names:
        f = pick(tid, pid)
        if f is None or (f != "keep" and f not in files):
            out[tid]["legends"].pop(str(pid), None)  # fall back to MLB's headshot
        elif f != "keep":
            out[tid]["legends"][str(pid)] = {"src": files[f]["src"], "file": files[f]["file"], "w": files[f]["w"], "h": files[f]["h"]}
            if f in PHOTO_FOCUS:
                out[tid]["legends"][str(pid)]["pos"] = PHOTO_FOCUS[f]
    for tid, picks in SCRAPBOOK.items():
        arc = out.setdefault(str(tid), {"archive": [], "legends": {}})["archive"]
        have = {a["src"] for a in arc}
        for f, year, title, caption in picks:
            im = files.get(f)
            if not im or im["src"] in have:
                continue
            have.add(im["src"])
            arc.append({"title": title, "year": year, "caption": caption or clean_desc(im["desc"]), "url": im["file"],
                        "src": im["src"], "file": im["file"], "w": im["w"], "h": im["h"]})
        arc.sort(key=lambda x: (x["year"] is None, x["year"] or 0))

    # ballparks
    history = json.load(open(os.path.join(ROOT, "data", "history.json")))
    for tid, v in history.items():
        parks = out.setdefault(tid, {"archive": [], "legends": {}}).setdefault("parks", {})
        for p in v.get("ballparks", []):
            title = PARK_TITLES.get((int(tid), p["name"], p["from"])) or PARK_TITLES.get(p["name"]) or p["name"]
            it = park_item(title)
            f = PARK_PHOTOS.get((int(tid), p["name"], p["from"]))
            f = f if isinstance(f, dict) else files.get(f)
            if it and f:  # hand-picked photo for a park whose article has none we can use
                it.update(src=f["src"], file=f["file"])
            if it:
                parks[f"{p['name']}|{p['from']}"] = it
    # faces: managers and Hall of Famers whose MLB headshot is the blank silhouette
    people = json.load(open(os.path.join(ROOT, "data", "people.json")))
    for tid in out:
        ids = [m["id"] for m in people.get(tid, {}).get("managers", [])] + [h["id"] for h in history.get(tid, {}).get("hof", [])]
        faces = out[tid].setdefault("faces", {})
        for pid in ids:
            f = FACE_PHOTOS.get((int(tid), pid), FACE_PHOTOS.get(pid))
            if f == "mlb83":
                faces[str(pid)] = {"src": f"https://img.mlbstatic.com/mlb-photos/image/upload/w_240,q_auto:best/v1/people/{pid}/headshot/83/current"}
            elif f in files:
                faces[str(pid)] = {"src": files[f]["src"], "file": files[f]["file"]} | ({"pos": PHOTO_FOCUS[f]} if f in PHOTO_FOCUS else {})
    with open(os.path.join(ROOT, "data", "photos.json"), "w") as fh:
        json.dump(out, fh, indent=1)
    for tid, v in out.items():
        print(f"{tid}: {len(v['archive']):2} archive, {len(v['legends'])}/{LEGEND_CARDS} legends, {sum(1 for x in v.get('parks', {}).values() if x['src'])}/{len(v.get('parks', {}))} parks  "
              + ", ".join(f"{a['year']}" for a in v["archive"]))


if __name__ == "__main__":
    main()
