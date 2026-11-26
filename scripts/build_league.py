"""Build data/league.json: every club's record in every season, for the League charts.

  {team id: [[season, wins, losses], ...]}   oldest season first, seasons with no games left out

Usage: python3 scripts/build_league.py   (responses cached in $DTM_CACHE or ./.cache; re-run after each season)
"""
import concurrent.futures as cf, datetime, json, os, sys

sys.path.insert(0, os.path.dirname(__file__))
from build_legends import get  # the shared cached Stats API client

ROOT = os.path.join(os.path.dirname(__file__), "..")


def seasons(tid):
    splits = get(f"/teams/{tid}/stats?stats=yearByYear&group=pitching&sportId=1")["stats"][0]["splits"]
    rows = [[int(s["season"]), s["stat"]["wins"], s["stat"]["losses"]] for s in splits]
    return tid, sorted(r for r in rows if r[1] + r[2] > 0)


if __name__ == "__main__":
    teams = [t["id"] for t in get(f"/teams?sportId=1&season={datetime.date.today().year}")["teams"] if t.get("sport", {}).get("id") == 1]
    with cf.ThreadPoolExecutor(6) as ex:
        out = dict(ex.map(seasons, sorted(teams)))
    with open(os.path.join(ROOT, "data", "league.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"{len(out)} clubs, {sum(len(v) for v in out.values())} club-seasons, through {max(v[-1][0] for v in out.values())}")
