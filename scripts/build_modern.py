"""Build data/modern.json: each club's Modern Stars, its best players of the last 20 seasons.

Unlike the Legends chapter's home-made estimate, this ranks by real WAR, as the MLB Stats API
publishes it (`stats=sabermetrics`, which includes fielding, baserunning and position).

The rules:
  window   the last WINDOW completed regular seasons (2007-2026 when this was written)
  qualify  at least MIN_SEASONS seasons in that window in which the player appeared for the club,
           or any player who appeared for the club in the latest season (today's stars count)
  rank     total WAR with the club in that window (other clubs' seasons don't count)

A player traded mid-season is credited only with what he did for this club. Pitchers' batting
is left out, except for two-way players.

Output: {team id: {"from", "to", "min", "qualified", "players": [...], "best": {...}}}
  players  the top TOP_N qualifiers, each with WAR by season ("years": [[year, war], ...]),
           a stat line with the club, and "active" if he played for the club in the latest season
  best     the best single season by anyone for the club in the window (no season minimum)

Usage: python3 scripts/build_modern.py   (responses cached in $DTM_CACHE or ./.cache)
"""
import concurrent.futures as cf, datetime, json, os, sys

sys.path.insert(0, os.path.dirname(__file__))
from build_legends import get, ip, NAME_FIX  # the shared cached Stats API client

WINDOW, MIN_SEASONS, TOP_N = 20, 4, 15
ROOT = os.path.join(os.path.dirname(__file__), "..")


def last_complete_season():
    today = datetime.date.today().isoformat()
    for y in range(datetime.date.today().year, 2000, -1):
        s = (get(f"/seasons/{y}?sportId=1").get("seasons") or [{}])[0]
        if s.get("regularSeasonEndDate", "9999") < today:
            return y
    raise SystemExit("no completed season found")


def splits(kind, group, season, tid):
    d = get(f"/stats?stats={kind}&group={group}&season={season}&teamId={tid}&playerPool=ALL&sportId=1&limit=500")
    return (d.get("stats") or [{}])[0].get("splits", [])


HIT_KEYS = ("gamesPlayed", "plateAppearances", "atBats", "hits", "doubles", "triples", "homeRuns", "rbi",
            "stolenBases", "baseOnBalls", "hitByPitch", "sacFlies", "totalBases")
PIT_KEYS = ("gamesPlayed", "gamesStarted", "wins", "losses", "saves", "earnedRuns", "strikeOuts")


def last_club(pid):
    """The club a player last appeared for in the majors (MLB's headshot shows that uniform)."""
    best = (0, -1, None)
    for st in get(f"/people/{pid}/stats?stats=yearByYear&group=hitting,pitching").get("stats", []):
        for sp in st.get("splits", []):
            if (sp.get("sport") or {}).get("id", 1) == 1 and sp.get("team"):
                best = max(best, (int(sp["season"]), sp.get("sequenceNumber") or 0, sp["team"]["id"]), key=lambda t: t[:2])
    return best[2]


def team_modern(tid, first, last):
    players = {}

    def p(sp):
        pid = sp["player"]["id"]
        return players.setdefault(pid, {"id": pid, "name": sp["player"]["fullName"], "war": {}, "bat": 0.0, "pit": 0.0,
                                        "hit": dict.fromkeys(HIT_KEYS, 0), "pitch": dict.fromkeys(PIT_KEYS, 0) | {"outs": 0},
                                        "hitwar": {}, "pitwar": {}})

    for y in range(first, last + 1):
        for group in ("hitting", "pitching"):
            for sp in splits("sabermetrics", group, y, tid):
                pl = p(sp)
                (pl["hitwar"] if group == "hitting" else pl["pitwar"])[y] = sp["stat"].get("war") or 0.0
            for sp in splits("season", group, y, tid):
                pl, s = p(sp), sp["stat"]
                if group == "hitting":
                    pl["hit"] = {k: pl["hit"][k] + (s.get(k) or 0) for k in HIT_KEYS}
                    pl.setdefault("hityears", set()).add(y)
                else:
                    pl["pitch"] = {k: pl["pitch"][k] + (s.get(k) or 0) for k in PIT_KEYS} | {"outs": pl["pitch"]["outs"] + round(ip(s.get("inningsPitched")) * 3)}
                    pl.setdefault("pityears", set()).add(y)

    # names, positions and birth years in batches
    ids = list(players)
    for i in range(0, len(ids), 100):
        for person in get("/people?personIds=" + ",".join(map(str, ids[i:i + 100]))).get("people", []):
            pl = players[person["id"]]
            pl["pos"] = (person.get("primaryPosition") or {}).get("abbreviation", "")
            pl["name"] = NAME_FIX.get(person.get("fullName"), person.get("fullName", pl["name"]))
            pl["born"] = person.get("birthDate", "")[:4]
            if person.get("nickName"):
                pl["nick"] = person["nickName"]

    out = []
    for pl in players.values():
        pitcher_only = pl.get("pos") == "P"
        hitwar = {} if pitcher_only else pl["hitwar"]
        years = sorted(set(pl.get("pityears", set())) | (set() if pitcher_only else set(pl.get("hityears", set()))))
        war = {y: round(hitwar.get(y, 0) + pl["pitwar"].get(y, 0), 2) for y in years}
        pl["bat"], pl["pit"] = sum(hitwar.values()), sum(pl["pitwar"].values())
        pl["years"], pl["warby"] = years, war
        pl["total"] = round(sum(war.values()), 1)
        out.append(pl)

    best = max(((pl, y, w) for pl in out for y, w in pl["warby"].items()), key=lambda t: t[2], default=None)
    # qualify: MIN_SEASONS seasons with the club, or on the club in the latest season
    q = sorted((pl for pl in out if len(pl["years"]) >= MIN_SEASONS or pl["years"][-1:] == [last]), key=lambda pl: -pl["total"])
    top = []
    for pl in q[:TOP_N]:
        h, pt = pl["hit"], pl["pitch"]
        rec = {"id": pl["id"], "name": pl["name"], "pos": pl.get("pos", ""), "born": pl.get("born", ""),
               "war": pl["total"], "bat": round(pl["bat"], 1), "pit": round(pl["pit"], 1),
               "seasons": len(pl["years"]), "from": pl["years"][0], "to": pl["years"][-1],
               "active": pl["years"][-1] == last,
               "years": [[y, round(pl["warby"][y], 1)] for y in pl["years"]]}
        if pl.get("nick"):
            rec["nick"] = pl["nick"]
        rec["home"] = last_club(pl["id"]) == tid  # MLB's headshot shows this club's uniform
        bestyr = max(pl["warby"], key=pl["warby"].get)
        rec["peak"] = [bestyr, round(pl["warby"][bestyr], 1)]
        hitline = pitline = None
        if h["plateAppearances"] and pl.get("pos") != "P":
            ab, obp_den = h["atBats"], h["atBats"] + h["baseOnBalls"] + h["hitByPitch"] + h["sacFlies"]
            obp = (h["hits"] + h["baseOnBalls"] + h["hitByPitch"]) / obp_den if obp_den else 0
            slg = h["totalBases"] / ab if ab else 0
            hitline = {"g": h["gamesPlayed"], "h": h["hits"], "hr": h["homeRuns"], "rbi": h["rbi"], "sb": h["stolenBases"],
                       "avg": round(h["hits"] / ab, 3) if ab else 0, "obp": round(obp, 3), "slg": round(slg, 3), "ops": round(obp + slg, 3)}
        if pt["outs"]:
            pitline = {"g": pt["gamesPlayed"], "gs": pt["gamesStarted"], "w": pt["wins"], "l": pt["losses"], "sv": pt["saves"],
                       "ip": round(pt["outs"] / 3, 1), "era": round(27 * pt["earnedRuns"] / pt["outs"], 2), "k": pt["strikeOuts"]}
        rec["kind"] = "pitcher" if (pl["pit"] > pl["bat"] and pitline) or not hitline else "hitter"
        rec["line"] = pitline if rec["kind"] == "pitcher" else hitline
        if rec["kind"] == "hitter" and pitline and pl["pit"] > 2:  # two-way (Ohtani)
            rec["line2"] = pitline
        top.append(rec)
    res = {"from": first, "to": last, "min": MIN_SEASONS, "qualified": len(q), "players": top}
    # the longest stay among qualifiers, and the best of them still with the club
    if q:
        lg = max(q, key=lambda pl: (len(pl["years"]), pl["total"]))
        res["longest"] = {"id": lg["id"], "name": lg["name"], "seasons": len(lg["years"]), "from": lg["years"][0], "to": lg["years"][-1]}
    act = [pl for pl in q if pl["years"][-1] == last]
    if act:
        res["leader"] = {"id": act[0]["id"], "name": act[0]["name"], "war": act[0]["total"], "seasons": len(act[0]["years"])}
    if best:
        pl, y, w = best
        res["best"] = {"id": pl["id"], "name": pl["name"], "year": y, "war": round(w, 1), "pos": pl.get("pos", "")}
    return tid, res


def main():
    last = last_complete_season()
    first = last - WINDOW + 1
    teams = sorted(get("/teams?sportId=1")["teams"], key=lambda t: t["name"])
    with cf.ThreadPoolExecutor(6) as ex:
        res = dict(ex.map(lambda t: team_modern(t["id"], first, last), teams))
    with open(os.path.join(ROOT, "data", "modern.json"), "w") as fh:
        json.dump({str(k): v for k, v in res.items()}, fh, indent=1)
    print(f"window {first}-{last}, at least {MIN_SEASONS} seasons or active in {last}")
    for t in teams:
        r = res[t["id"]]
        print(f'{t["abbreviation"]:>4} ({r["qualified"]:2})', " | ".join(f'{p["name"]} {p["war"]}' for p in r["players"][:6]))


if __name__ == "__main__":
    main()
