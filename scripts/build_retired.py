"""Build data/retired.json — every retired uniform number, by franchise.

Parsed from Wikipedia's "List of Major League Baseball retired numbers" (the main table).
Rows are matched to today's clubs by the linked team article (old club names map forward).

Usage: python3 scripts/build_retired.py
"""
import json, os, re, sys

sys.path.insert(0, os.path.dirname(__file__))
from build_photos import fetch  # noqa: E402  (cached, throttled)

ROOT = os.path.join(os.path.dirname(__file__), "..")
URL = "https://en.wikipedia.org/w/api.php?action=parse&page=List_of_Major_League_Baseball_retired_numbers&prop=wikitext&format=json&formatversion=2"

TEAMS = {
    "Arizona Diamondbacks": 109, "Oakland Athletics": 133, "Athletics": 133, "Sacramento Athletics": 133,
    "Kansas City Athletics": 133, "Philadelphia Athletics": 133, "Atlanta Braves": 144, "Milwaukee Braves": 144,
    "Boston Braves": 144, "Baltimore Orioles": 110, "St. Louis Browns": 110, "Boston Red Sox": 111,
    "Chicago Cubs": 112, "Chicago White Sox": 145, "Cincinnati Reds": 113, "Cleveland Guardians": 114,
    "Cleveland Indians": 114, "Colorado Rockies": 115, "Detroit Tigers": 116, "Houston Astros": 117,
    "Kansas City Royals": 118, "Los Angeles Angels": 108, "Los Angeles Dodgers": 119, "Brooklyn Dodgers": 119,
    "Miami Marlins": 146, "Florida Marlins": 146, "Milwaukee Brewers": 158, "Minnesota Twins": 142,
    "New York Mets": 121, "New York Yankees": 147, "Philadelphia Phillies": 143, "Pittsburgh Pirates": 134,
    "San Diego Padres": 135, "San Francisco Giants": 137, "New York Giants (baseball)": 137,
    "New York Giants (NL)": 137, "Seattle Mariners": 136, "St. Louis Cardinals": 138, "Tampa Bay Rays": 139,
    "Athletics (baseball)": 133, "Los Angeles Angels of Anaheim": 108, "Philadelphia": 143,
    "Texas Rangers (baseball)": 140, "Toronto Blue Jays": 141, "Washington Nationals": 120, "Montreal Expos": 120,
}
COLORS = {"ffb": "hof", "cfc": "frick", "fc6": "broadcaster", "cfecec": "league", "ffbbbb": "honorary", "eccfec": "shared"}


def clean_name(cell):
    m = re.search(r"\{\{sortname\|([^|}]*)\|([^|}]*)(?:\|([^|}]*))?", cell)
    if m:
        first, last, article = m.groups()
        name = f"{first} {last}".strip()
        return name, (article or name)
    m = re.search(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]", cell)
    if m:
        return (m.group(2) or m.group(1)).strip(), m.group(1).strip()
    t = re.sub(r"<[^>]+>|\{\{[^}]*\}\}|'''?", "", cell).strip()
    return t, t


def main():
    text = fetch(URL).get("parse", {}).get("wikitext", "")
    if not text:
        sys.exit("could not fetch the list")
    table = text.split("==List of all-time retired numbers==", 1)[1].split("\n==", 1)[0]
    out = {}
    for row in table.split("\n|-"):
        row = row.strip()
        if not row.startswith("|") or "||" not in row:
            continue
        cells = [c.strip() for c in row.lstrip("|").split("||")]
        if len(cells) < 4:
            continue
        no, who, team, date = cells[:4]
        styles = re.findall(r"background:\s*#(\w+)", who + no)
        who = who.split("|", 1)[1] if re.match(r'^style=', who) else who
        name, article = clean_name(who)
        tm = re.search(r"\[\[([^\]|]+)", team)
        tid = TEAMS.get(tm.group(1)) if tm else None
        if not tid:
            print("skip team:", team, name, file=sys.stderr)
            continue
        dm = re.search(r"\{\{dts\|(\d{4})", date) or re.search(r"(\d{4})", date)
        no = re.sub(r"<[^>]+>|\{\{[^}]*\}\}|style=[^|]*\|", "", no).strip()
        out.setdefault(str(tid), []).append({
            "no": no, "name": name, "article": article, "year": int(dm.group(1)) if dm else None,
            "tags": sorted({COLORS[s] for s in styles if s in COLORS}),
        })
    for v in out.values():
        v.sort(key=lambda r: (not r["no"].isdigit(), int(r["no"]) if r["no"].isdigit() else 0, r["year"] or 0))
    with open(os.path.join(ROOT, "data", "retired.json"), "w") as fh:
        json.dump(out, fh, indent=1, ensure_ascii=False)
    for tid, v in sorted(out.items()):
        print(tid, len(v), ", ".join(f"{r['no']} {r['name']}" for r in v))


if __name__ == "__main__":
    main()
