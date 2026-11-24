"""Build data/champions.json: {season: {winner:{id,name}, loser:{id,name}, result:"4-3", games:[...], mvp:{id,name}}}

games: every World Series game in order, as {date, home, away (team ids), hs, as (runs), inn, park}.
mvp: the World Series MVP (awarded since 1955), when it went to the winning club or the losing one."""
import json, urllib.request, concurrent.futures as cf

API = "https://statsapi.mlb.com/api/v1"


def get(url):
    return json.load(urllib.request.urlopen(url, timeout=30))


def ws(y):
    try:
        d = get(f"{API}/schedule?sportId=1&gameType=W&season={y}&hydrate=linescore")
        if not d.get("dates"): return y, None
        games = [g for dt in d["dates"] for g in dt["games"] if g["status"]["detailedState"].startswith("Final") or g["status"].get("abstractGameState")=="Final"]
        if not games: return y, None
        g = games[-1]
        sides = [g["teams"][s] for s in ("home","away")]
        sides.sort(key=lambda s: -s.get("leagueRecord",{}).get("wins",0))
        w, l = sides
        # a suspended game is listed once per day it was played; a postponed one has no score
        last = {x["gamePk"]: x for x in games if x["teams"]["home"].get("score") is not None}
        games = [x for x in dict.fromkeys(x["gamePk"] for x in games) if x in last]
        games = [last[k] for k in games]
        played = [{"date": x["officialDate"] if x.get("officialDate") else x["gameDate"][:10],
                   "home": x["teams"]["home"]["team"]["id"], "away": x["teams"]["away"]["team"]["id"],
                   "hs": x["teams"]["home"].get("score"), "as": x["teams"]["away"].get("score"),
                   "inn": (x.get("linescore") or {}).get("currentInning"), "park": (x.get("venue") or {}).get("name")}
                  for x in games]
        return y, {"winner":{"id":w["team"]["id"],"name":w["team"]["name"]},"loser":{"id":l["team"]["id"],"name":l["team"]["name"]},
                   "result":f'{w["leagueRecord"]["wins"]}-{w["leagueRecord"]["losses"]}' + (f'-{w["leagueRecord"]["ties"]}' if w["leagueRecord"].get("ties") else ""),
                   "games": played}
    except Exception as e:
        return y, {"error": str(e)}


with cf.ThreadPoolExecutor(8) as ex:
    out = dict(ex.map(ws, range(1903, 2027)))
out = {str(k): v for k, v in sorted(out.items()) if v}
for a in get(f"{API}/awards/WSMVP/recipients").get("awards", []):
    c = out.get(str(a["season"]))
    if c and "error" not in c:
        c.setdefault("mvp", []).append({"id": a["player"]["id"], "name": a["player"].get("nameFirstLast"), "team": (a.get("team") or {}).get("id")})
json.dump(out, open("data/champions.json","w"), indent=0)
print(len(out), [k for k,v in out.items() if "error" in v])
