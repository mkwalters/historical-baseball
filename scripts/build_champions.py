"""Build data/champions.json: {season: {winner:{id,name}, loser:{id,name}, result:"4-3"}}"""
import json, urllib.request, concurrent.futures as cf
def ws(y):
    try:
        d = json.load(urllib.request.urlopen(f"https://statsapi.mlb.com/api/v1/schedule?sportId=1&gameType=W&season={y}", timeout=30))
        if not d.get("dates"): return y, None
        games = [g for dt in d["dates"] for g in dt["games"] if g["status"]["detailedState"].startswith("Final") or g["status"].get("abstractGameState")=="Final"]
        if not games: return y, None
        g = games[-1]
        sides = [g["teams"][s] for s in ("home","away")]
        sides.sort(key=lambda s: -s.get("leagueRecord",{}).get("wins",0))
        w, l = sides
        return y, {"winner":{"id":w["team"]["id"],"name":w["team"]["name"]},"loser":{"id":l["team"]["id"],"name":l["team"]["name"]},
                   "result":f'{w["leagueRecord"]["wins"]}-{w["leagueRecord"]["losses"]}' + (f'-{w["leagueRecord"]["ties"]}' if w["leagueRecord"].get("ties") else "")}
    except Exception as e:
        return y, {"error": str(e)}
with cf.ThreadPoolExecutor(8) as ex:
    out = dict(ex.map(ws, range(1903, 2027)))
out = {str(k): v for k, v in sorted(out.items()) if v}
json.dump(out, open("data/champions.json","w"), indent=0)
print(len(out), [k for k,v in out.items() if "error" in v])
