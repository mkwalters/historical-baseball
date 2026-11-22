"""Build data/legends.json — each franchise's most valuable players of all time.

The Stats API has no WAR, so we estimate a WAR-style "Legend Value" from each
player's season-by-season numbers *with that franchise*, normalised to the league
run environment of each season:

  hitters   batting runs  = (wOBA - lg wOBA) / 1.2 * PA          (fixed linear weights)
            + position    = per-600-PA positional adjustment (C/SS up, 1B/DH down)
            + replacement = 20 runs per 600 PA, scaled to the era's scoring
  pitchers  pitching runs = (1.2 * lg RA9 - RA9) * IP / 9         (runs allowed, since
                                                                   old seasons lack ER)
  runs -> wins with runs-per-win = 10 * (runs per game, both teams / 9) ** 0.7

It ignores defense and park effects, so treat it as a fun estimate, not bWAR.

Usage: python3 scripts/build_legends.py   (responses cached in $DTM_CACHE or ./.cache)
"""
import concurrent.futures as cf, hashlib, json, os, sys, time, urllib.request

API = "https://statsapi.mlb.com/api/v1"
CACHE = os.environ.get("DTM_CACHE", os.path.join(os.path.dirname(__file__), "..", ".cache"))
os.makedirs(CACHE, exist_ok=True)
HIT_POOL, PIT_POOL, TOP_N = 70, 45, 8

# A few greats the API lists by formal first name.
NAME_FIX = {"Tristram Speaker": "Tris Speaker", "Grover Alexander": "Grover Cleveland Alexander"}

POS_ADJ = {"C": 12.5, "SS": 7.5, "2B": 3, "3B": 2, "CF": 2.5, "LF": -7.5, "RF": -7.5, "OF": -5,
           "1B": -12.5, "DH": -17.5, "TWP": 0, "P": 0}


def get(path):
    f = os.path.join(CACHE, hashlib.md5(path.encode()).hexdigest() + ".json")
    if os.path.exists(f):
        with open(f) as fh:
            return json.load(fh)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(API + path, timeout=40) as r:
                d = json.load(r)
            with open(f, "w") as fh:
                json.dump(d, fh)
            return d
        except Exception as e:
            if attempt == 3:
                print("FAIL", path, e, file=sys.stderr)
                return {}
            time.sleep(1.5 * (attempt + 1))


def ip(s):
    a, _, b = str(s or "0").partition(".")
    return int(a or 0) + int(b or 0) / 3


def woba_num(s):
    singles = s.get("hits", 0) - s.get("doubles", 0) - s.get("triples", 0) - s.get("homeRuns", 0)
    return (0.69 * s.get("baseOnBalls", 0) + 0.72 * s.get("hitByPitch", 0) + 0.89 * singles +
            1.27 * s.get("doubles", 0) + 1.62 * s.get("triples", 0) + 2.10 * s.get("homeRuns", 0))


def league_year(y):
    hit = get(f"/teams/stats?season={y}&sportIds=1&group=hitting&stats=season")
    pit = get(f"/teams/stats?season={y}&sportIds=1&group=pitching&stats=season")
    hs = [x["stat"] for x in (hit.get("stats") or [{}])[0].get("splits", [])]
    ps = [x["stat"] for x in (pit.get("stats") or [{}])[0].get("splits", [])]
    pa = sum(s.get("plateAppearances", 0) for s in hs)
    g = sum(s.get("gamesPlayed", 0) for s in hs)
    inn = sum(ip(s.get("inningsPitched")) for s in ps)
    if not pa or not g or not inn:
        return y, None
    runs = sum(s.get("runs", 0) for s in hs)
    ra = sum(s.get("runs", 0) for s in ps)
    rpg_both = 2 * runs / g
    return y, {"woba": sum(woba_num(s) for s in hs) / pa, "r_pa": runs / pa, "ra9": 9 * ra / inn,
               "rpw": 10 * (rpg_both / 9) ** 0.7}


def player_value(pid, team_id, lg, pos):
    d = get(f"/people/{pid}/stats?stats=yearByYear&group=hitting,pitching")
    bat = pit = 0.0
    years = set()
    for st in d.get("stats", []):
        grp = st["group"]["displayName"]
        for sp in st.get("splits", []):
            if sp.get("team", {}).get("id") != team_id or sp.get("sport", {}).get("id", 1) != 1:
                continue
            y = int(sp["season"])
            L = lg.get(y) or lg[min(lg, key=lambda k: abs(k - y))]
            s = sp["stat"]
            if grp == "hitting" and pos != "P":
                pa = s.get("plateAppearances", 0)
                if not pa:
                    continue
                runs = (woba_num(s) / pa - L["woba"]) / 1.2 * pa
                runs += POS_ADJ.get(pos, 0) * pa / 600
                runs += 20 * pa / 600 * (L["r_pa"] / 0.118)
                bat += runs / L["rpw"]
                years.add(y)
            elif grp == "pitching":
                inn = ip(s.get("inningsPitched"))
                if not inn:
                    continue
                ra9 = 9 * s.get("runs", 0) / inn
                pit += (1.2 * L["ra9"] - ra9) * inn / 9 / L["rpw"]
                years.add(y)
    return bat, pit, sorted(years)


def team_legends(team, lg):
    tid = team["id"]
    hit = get(f"/stats?stats=career&group=hitting&teamId={tid}&playerPool=ALL&sortStat=plateAppearances&order=desc&limit={HIT_POOL}&sportId=1")
    pit = get(f"/stats?stats=career&group=pitching&teamId={tid}&playerPool=ALL&sortStat=inningsPitched&order=desc&limit={PIT_POOL}&sportId=1")
    cand = {}
    for grp, d in (("hitting", hit), ("pitching", pit)):
        for sp in (d.get("stats") or [{}])[0].get("splits", []):
            p = cand.setdefault(sp["player"]["id"], {"id": sp["player"]["id"], "name": sp["player"]["fullName"], "career": {}})
            p["career"][grp] = sp["stat"]
            if sp.get("position"):
                p["pos"] = sp["position"].get("abbreviation")
    # primary positions in one call
    ids = list(cand)
    for i in range(0, len(ids), 100):
        ppl = get("/people?personIds=" + ",".join(map(str, ids[i:i + 100])))
        for person in ppl.get("people", []):
            cand[person["id"]]["pos"] = person.get("primaryPosition", {}).get("abbreviation", cand[person["id"]].get("pos"))
            nm = person.get("fullName", cand[person["id"]]["name"])
            cand[person["id"]]["name"] = NAME_FIX.get(nm, nm)
            if person.get("nickName"):
                cand[person["id"]]["nick"] = person["nickName"]
            cand[person["id"]]["born"] = person.get("birthDate", "")[:4]
    out = []
    for p in cand.values():
        bat, pitv, years = player_value(p["id"], tid, lg, p.get("pos"))
        if not years:
            continue
        out.append({**p, "value": round(bat + pitv, 1), "bat": round(bat, 1), "pit": round(pitv, 1),
                    "from": years[0], "to": years[-1], "seasons": len(years)})
    out.sort(key=lambda x: -x["value"])
    top = out[:TOP_N]
    for p in top:
        c = p.pop("career")
        h, pt = c.get("hitting", {}), c.get("pitching", {})
        p["line"] = {}
        if p["bat"] >= p["pit"] and h:
            p["kind"] = "hitter"
            p["line"] = {k: h.get(k) for k in ("gamesPlayed", "hits", "homeRuns", "rbi", "avg", "ops", "stolenBases")}
        else:
            p["kind"] = "pitcher"
            p["line"] = {k: pt.get(k) for k in ("wins", "losses", "era", "strikeOuts", "saves", "inningsPitched")}
        if p["kind"] == "hitter" and p["pit"] > 5 and pt:  # two-way greats (Ruth, Ohtani)
            p["line2"] = {k: pt.get(k) for k in ("wins", "era", "strikeOuts")}
    return tid, top


def main():
    teams = sorted(get("/teams?sportId=1")["teams"], key=lambda t: t["name"])
    with cf.ThreadPoolExecutor(8) as ex:
        lg = {y: v for y, v in ex.map(league_year, range(1871, 2027)) if v}
    print(f"league years: {min(lg)}-{max(lg)} ({len(lg)})")
    with cf.ThreadPoolExecutor(6) as ex:
        res = dict(ex.map(lambda t: team_legends(t, lg), teams))
    path = os.path.join(os.path.dirname(__file__), "..", "data", "legends.json")
    with open(path, "w") as fh:
        json.dump({str(k): v for k, v in res.items()}, fh, indent=1)
    for t in teams:
        print(f'{t["abbreviation"]:>4}', " | ".join(f'{p["name"]} {p["value"]}' for p in res[t["id"]][:5]))


if __name__ == "__main__":
    main()
