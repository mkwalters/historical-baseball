"""Build data/history.json — per-franchise ballparks, trophy case, and Hall of Famers.

  ballparks: consecutive seasons at each home venue  [{name, id, from, to}]
  awards:    MVP / Cy Young / Rookie of the Year winners while with the franchise
  hof:       Hall of Famers whose plaque the API credits to the franchise

Usage: python3 scripts/build_history.py
"""
import concurrent.futures as cf, json, os, re, sys

sys.path.insert(0, os.path.dirname(__file__))
from build_legends import get  # shared cached fetch

ROOT = os.path.join(os.path.dirname(__file__), "..")
AWARDS = {"ALMVP": "MVP", "NLMVP": "MVP", "ALCY": "Cy Young", "NLCY": "Cy Young", "MLBCY": "Cy Young",
          "ALROY": "Rookie of the Year", "NLROY": "Rookie of the Year"}


def venues_for(y):
    d = get(f"/teams?sportId=1&season={y}&hydrate=venue")
    return y, {t["id"]: t.get("venue", {}) for t in d.get("teams", []) if t.get("venue", {}).get("name")}


def main():
    teams = get("/teams?sportId=1")["teams"]
    out = {str(t["id"]): {"ballparks": [], "awards": [], "hof": []} for t in teams}

    with cf.ThreadPoolExecutor(8) as ex:
        by_year = dict(ex.map(venues_for, range(1876, 2027)))
    for y in sorted(by_year):
        for tid, v in by_year[y].items():
            if str(tid) not in out or v["name"].strip() in ("TBD", "Generic"):
                continue
            name = re.sub(r"\s*\(\d{4}-\d{2,4}\)$", "", v["name"]).strip()
            name = re.sub(r"\s+(I|II|III|IV|V)$", "", name)  # "Polo Grounds IV" -> "Polo Grounds"
            parks = out[str(tid)]["ballparks"]
            # same venue id in (nearly) consecutive seasons = one park, possibly renamed. Early-era data
            # also splits one park across ids, so merge by name there (but not e.g. the two Yankee Stadiums).
            same = parks and (parks[-1]["id"] == v.get("id") or (y < 1960 and parks[-1]["names"][-1] == name))
            if same and parks[-1]["to"] >= y - 2:
                parks[-1]["to"] = y
                parks[-1]["years"][name] = parks[-1]["years"].get(name, 0) + 1
                if name not in parks[-1]["names"]:
                    parks[-1]["names"].append(name)
            else:
                parks.append({"id": v.get("id"), "names": [name], "years": {name: 1}, "from": y, "to": y})
    for v in out.values():
        for p in v["ballparks"]:
            years = p.pop("years")
            # current name for parks still in use; otherwise the name it carried longest
            p["name"] = p["names"][-1] if p["to"] >= 2026 else max(p["names"], key=lambda n: years[n])
            p["aka"] = [n for n in p.pop("names") if n != p["name"]]

    seen = set()
    for code, label in AWARDS.items():
        for a in get(f"/awards/{code}/recipients").get("awards", []):
            tid = str(a.get("team", {}).get("id"))
            key = (tid, label, a["season"], a["player"]["id"])
            if tid in out and key not in seen:
                seen.add(key)
                out[tid]["awards"].append({"award": label, "season": int(a["season"]), "id": a["player"]["id"],
                                           "name": a["player"].get("nameFirstLast")})
    for v in out.values():
        v["awards"].sort(key=lambda a: (a["season"], a["award"]))

    for a in get("/awards/MLBHOF/recipients").get("awards", []):
        tid = str(a.get("team", {}).get("id"))
        if tid in out:
            out[tid]["hof"].append({"id": a["player"]["id"], "name": a["player"].get("nameFirstLast"),
                                    "inducted": int(a["season"]), "pos": a["player"].get("primaryPosition", {}).get("abbreviation"),
                                    "note": a.get("notes")})
    for v in out.values():
        v["hof"].sort(key=lambda h: h["inducted"])

    with open(os.path.join(ROOT, "data", "history.json"), "w") as fh:
        json.dump(out, fh, indent=1)
    for t in sorted(teams, key=lambda t: t["name"]):
        v = out[str(t["id"])]
        print(f'{t["abbreviation"]:>4} parks={len(v["ballparks"])} awards={len(v["awards"])} hof={len(v["hof"])}  '
              + " → ".join(f'{p["name"]} ({p["from"]})' for p in v["ballparks"][:6]))


if __name__ == "__main__":
    main()
