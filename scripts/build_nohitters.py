"""Build data/nohitters.json: every no-hitter and perfect game since 1901, straight from the MLB Stats API.

How it finds them: each club's pitching game log (regular season and postseason) lists the hits it
allowed in every game. A game with 0 hits over 9+ innings is a no-hitter by the official definition
(since 1991, a rain-shortened or 8-inning loss doesn't count). Each find is then looked up in the
box score (pitchers, score) and the schedule (perfect-game flag, postseason round).

The game logs start in 1901, so the nineteenth-century no-hitters aren't here.

  [{"d": "1956-10-08", "pk": 67524, "t": 147, "tn": "New York Yankees", "o": 119, "on": "Brooklyn Dodgers",
    "home": true, "r": [2, 0], "p": [["Don Larsen", 118495, "9.0"]], "pg": true, "gt": "W"}, ...]

  t/o are today's club ids (the API keeps franchise ids across moves); tn/on are the names that day.
  r is [runs by the no-hit side's club, runs by its victim]. gt is the game type: R regular, or F/D/L/W.

Usage: python3 scripts/build_nohitters.py   (responses cached in $DTM_CACHE or ./.cache; re-run after each season)
"""
import concurrent.futures as cf, hashlib, json, os, sys, time, urllib.error, urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from build_legends import API, CACHE, ip

ROOT = os.path.join(os.path.dirname(__file__), "..")
FIRST = 1901


def get(path):
    """Cached GET that treats 404 as 'no such log' (most clubs miss most postseasons) and caches that too."""
    f = os.path.join(CACHE, hashlib.md5(path.encode()).hexdigest() + ".json")
    if os.path.exists(f):
        with open(f) as fh:
            return json.load(fh)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(API + path, timeout=40) as r:
                d = json.load(r)
            break
        except urllib.error.HTTPError as e:
            if e.code == 404:
                d = {}
                break
            err = e
        except Exception as e:
            err = e
        time.sleep(1.5 * (attempt + 1))
    else:
        print("FAIL", path, err, file=sys.stderr)
        return {}
    with open(f, "w") as fh:
        json.dump(d, fh)
    return d


def candidates(job):
    tid, season, gt = job
    d = get(f"/teams/{tid}/stats?stats=gameLog&group=pitching&season={season}&sportId=1&gameType={gt}")
    splits = (d.get("stats") or [{}])[0].get("splits", [])
    return [s for s in splits if s["stat"].get("hits") == 0 and ip(s["stat"].get("inningsPitched")) >= 9]


def detail(s):
    pk, tid = s["game"]["gamePk"], s["team"]["id"]
    box = get(f"/game/{pk}/boxscore")
    sched = get(f"/schedule?gamePk={pk}&hydrate=flags")
    game = next((g for day in sched.get("dates", []) for g in day["games"] if g["gamePk"] == pk), {})
    mine, theirs = ("home", "away") if s["isHome"] else ("away", "home")
    T, O = box["teams"][mine], box["teams"][theirs]
    arms = [[T["players"][f"ID{p}"]["person"]["fullName"], p, T["players"][f"ID{p}"]["stats"]["pitching"].get("inningsPitched", "")]
            for p in T["pitchers"]]
    # A few old box scores credit an extra pitcher (Brooklyn, 1925: Vance 9 IP, plus Decatur 4 from the other game
    # that day). If the arms add up to more than the game, keep the one who went the distance.
    total = ip(s["stat"]["inningsPitched"])
    if sum(ip(a[2]) for a in arms) > total + 0.01:
        arms = [a for a in arms if abs(ip(a[2]) - total) < 0.01][:1] or arms
    flags = game.get("flags", {})
    perfect = bool(flags.get(f"{mine}TeamPerfectGame"))
    if not perfect:
        # The flag comes from play-by-play, which the oldest games lack (Young 1904, Joss 1908, Robertson 1922).
        # For those, read the box score: nobody walked, was hit, or reached on an error. Only trusted without
        # play-by-play: a runner can reach on a dropped third strike and still leave this line clean (Means, 2021).
        V, F = O["teamStats"]["batting"], T["teamStats"]["fielding"]
        clean = not any(V.get(k) for k in ("baseOnBalls", "hitByPitch", "catchersInterference")) and not F.get("errors")
        perfect = clean and not get(f"/game/{pk}/playByPlay").get("allPlays")
    return {
        "d": s["date"], "pk": pk, "t": tid, "tn": T["team"]["name"], "o": O["team"]["id"], "on": O["team"]["name"],
        "home": s["isHome"], "r": [T["teamStats"]["batting"]["runs"], O["teamStats"]["batting"]["runs"]],
        "p": arms,
        "pg": perfect,
        "gt": game.get("gameType", "R"),
    }


if __name__ == "__main__":
    league = json.load(open(os.path.join(ROOT, "data", "league.json")))
    jobs = [(int(tid), y, gt) for tid, rows in league.items() for y, *_ in rows if y >= FIRST for gt in ("R", "P")]
    with cf.ThreadPoolExecutor(8) as ex:
        found = [s for batch in ex.map(candidates, jobs) for s in batch]
        found = list({s["game"]["gamePk"]: s for s in found}.values())
        out = sorted(ex.map(detail, found), key=lambda g: (g["d"], g["pk"]))
    with open(os.path.join(ROOT, "data", "nohitters.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"{len(out)} no-hitters ({sum(g['pg'] for g in out)} perfect, {sum(g['gt'] != 'R' for g in out)} postseason, "
          f"{sum(len(g['p']) > 1 for g in out)} combined), {out[0]['d']} to {out[-1]['d']}")
