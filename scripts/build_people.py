"""Build data/people.json — the dugout and the booth for each franchise.

* managers: every manager of record, season by season, from the MLB Stats API
  (`/teams/{id}/roster?rosterType=coach&season=Y`), merged into tenures with the club's
  record and titles in seasons they managed alone.
* voices & builders: a hand-picked list (PEOPLE below) of broadcasters, owners, executives
  and other figures, each with a Wikipedia summary and, when it is freely licensed, a photo.

Usage: python3 scripts/build_people.py      (run after build_champions.py)
"""
import concurrent.futures as cf, json, os, sys

sys.path.insert(0, os.path.dirname(__file__))
from build_photos import CACHE, summary, commons_image, first_sentences, commons_files  # noqa: E402
import hashlib, time, urllib.request  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..")
API = "https://statsapi.mlb.com/api/v1"


def mlb(path):
    f = os.path.join(CACHE, "m_" + hashlib.md5(path.encode()).hexdigest() + ".json")
    if os.path.exists(f):
        with open(f) as fh:
            return json.load(fh)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(API + path, timeout=30) as r:
                d = json.load(r)
            with open(f, "w") as fh:
                json.dump(d, fh)
            return d
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return {}
            time.sleep(2 * (attempt + 1))
        except Exception:
            time.sleep(2 * (attempt + 1))
    print("FAIL", path, file=sys.stderr)
    return {}


# Broadcasters, owners, executives and other figures, by team.
# (name, Wikipedia title, role, years). Years are the span with this club.
PEOPLE = {
    109: [("Jerry Colangelo", "Jerry Colangelo", "Founding owner", "1995–2004"),
          ("Thom Brennaman", "Thom Brennaman", "Broadcaster", "1998–2006"),
          ("Greg Schulte", "Greg Schulte", "Radio voice", "1998–2022")],
    133: [("Connie Mack", "Connie Mack", "Owner & manager", "1901–1950"),
          ("Charlie Finley", "Charlie Finley", "Owner", "1960–1980"),
          ("Bill King", "Bill King", "Broadcaster", "1981–2005"),
          ("Billy Beane", "Billy Beane", "General manager", "1997–2015"),
          ("Ken Korach", "Ken Korach", "Radio voice", "1996–")],
    144: [("Ernie Johnson Sr.", "Ernie Johnson Sr.", "Broadcaster", "1962–1999"),
          ("Skip Caray", "Skip Caray", "Broadcaster", "1976–2008"),
          ("Pete Van Wieren", "Pete Van Wieren", "Broadcaster", "1976–2008"),
          ("Ted Turner", "Ted Turner", "Owner", "1976–1996"),
          ("John Schuerholz", "John Schuerholz", "General manager", "1991–2007")],
    110: [("Chuck Thompson", "Chuck Thompson (sportscaster)", "Broadcaster", "1955–2000"),
          ("Jon Miller", "Jon Miller", "Broadcaster", "1983–1996"),
          ("Bill Veeck", "Bill Veeck", "Owner (St. Louis Browns)", "1951–1953"),
          ("Wild Bill Hagy", "Wild Bill Hagy", "Superfan", "1970s–80s")],
    111: [("Curt Gowdy", "Curt Gowdy", "Broadcaster", "1951–1965"),
          ("Ned Martin", "Ned Martin", "Broadcaster", "1961–1992"),
          ("Joe Castiglione", "Joe Castiglione", "Radio voice", "1983–2024"),
          ("Tom Yawkey", "Tom Yawkey", "Owner", "1933–1976"),
          ("Johnny Pesky", "Johnny Pesky", "Player, coach & ambassador", "1942–2012")],
    112: [("Jack Brickhouse", "Jack Brickhouse", "Broadcaster", "1948–1981"),
          ("Harry Caray", "Harry Caray", "Broadcaster", "1982–1997"),
          ("Pat Hughes", "Pat Hughes (sportscaster)", "Radio voice", "1996–"),
          ("Ron Santo", "Ron Santo", "Player & radio analyst", "1960–2010"),
          ("Philip K. Wrigley", "Philip K. Wrigley", "Owner", "1932–1977"),
          ("Theo Epstein", "Theo Epstein", "President", "2011–2020")],
    145: [("Bill Veeck", "Bill Veeck", "Owner", "1959–1980"),
          ("Harry Caray", "Harry Caray", "Broadcaster", "1971–1981"),
          ("Hawk Harrelson", "Ken Harrelson", "Broadcaster", "1982–2018"),
          ("Charles Comiskey", "Charles Comiskey", "Founder & owner", "1901–1931"),
          ("Nancy Faust", "Nancy Faust", "Organist", "1970–2010")],
    113: [("Marty Brennaman", "Marty Brennaman", "Broadcaster", "1974–2019"),
          ("Joe Nuxhall", "Joe Nuxhall", "Pitcher & broadcaster", "1944–2004"),
          ("Waite Hoyt", "Waite Hoyt", "Broadcaster", "1942–1965"),
          ("Powel Crosley Jr.", "Powel Crosley Jr.", "Owner", "1934–1961"),
          ("Bob Howsam", "Bob Howsam", "General manager", "1967–1985")],
    114: [("Herb Score", "Herb Score", "Pitcher & broadcaster", "1955–1997"),
          ("Tom Hamilton", "Tom Hamilton (sportscaster)", "Radio voice", "1990–"),
          ("Jimmy Dudley", "Jimmy Dudley", "Broadcaster", "1948–1967"),
          ("Bill Veeck", "Bill Veeck", "Owner", "1946–1949"),
          ("John Adams", "John Adams (drummer)", "Bleacher drummer", "1973–2023")],
    115: [("Jerry McMorris", "Jerry McMorris", "Founding owner", "1993–2005"),
          ("Jack Corrigan", "Jack Corrigan (sportscaster)", "Broadcaster", "2002–"),
          ("Drew Goodman", "Drew Goodman", "Broadcaster", "2002–")],
    116: [("Ernie Harwell", "Ernie Harwell", "Broadcaster", "1960–2002"),
          ("George Kell", "George Kell", "Player & broadcaster", "1946–1996"),
          ("Mike Ilitch", "Mike Ilitch", "Owner", "1992–2017"),
          ("Walter Briggs Sr.", "Walter Briggs Sr.", "Owner", "1920–1952")],
    117: [("Gene Elston", "Gene Elston", "Broadcaster", "1962–1986"),
          ("Milo Hamilton", "Milo Hamilton", "Broadcaster", "1985–2012"),
          ("Roy Hofheinz", "Roy Hofheinz", "Founder", "1962–1976"),
          ("Jim Crane", "Jim Crane", "Owner", "2011–")],
    118: [("Denny Matthews", "Denny Matthews", "Broadcaster", "1969–"),
          ("Ewing Kauffman", "Ewing Kauffman", "Founding owner", "1969–1993"),
          ("Fred White", "Fred White (sportscaster)", "Broadcaster", "1973–1998"),
          ("Buck O'Neil", "Buck O'Neil", "Scout & ambassador", "1988–2006")],
    108: [("Gene Autry", "Gene Autry", "Founding owner", "1961–1998"),
          ("Dick Enberg", "Dick Enberg", "Broadcaster", "1969–1978"),
          ("Rory Markas", "Rory Markas", "Broadcaster", "2002–2009")],
    119: [("Vin Scully", "Vin Scully", "Broadcaster", "1950–2016"),
          ("Red Barber", "Red Barber", "Broadcaster", "1939–1953"),
          ("Branch Rickey", "Branch Rickey", "President & GM", "1943–1950"),
          ("Walter O'Malley", "Walter O'Malley", "Owner", "1950–1979"),
          ("Jaime Jarrín", "Jaime Jarrín", "Spanish voice", "1959–2022"),
          ("Hilda Chester", "Hilda Chester", "Ebbets Field superfan", "1930s–1957")],
    146: [("Dave Van Horne", "Dave Van Horne", "Broadcaster", "2001–2021"),
          ("Wayne Huizenga", "Wayne Huizenga", "Founding owner", "1993–1999"),
          ("Felo Ramírez", "Felo Ramírez", "Spanish voice", "1993–2017")],
    158: [("Bob Uecker", "Bob Uecker", "Broadcaster", "1971–2024"),
          ("Bud Selig", "Bud Selig", "Founding owner", "1970–1998"),
          ("Bernie Brewer", "Bernie Brewer", "Mascot", "1973–")],
    142: [("Herb Carneal", "Herb Carneal", "Broadcaster", "1962–2007"),
          ("Calvin Griffith", "Calvin Griffith", "Owner", "1955–1984"),
          ("Clark Griffith", "Clark Griffith", "Manager & owner", "1912–1955"),
          ("Bob Wolff", "Bob Wolff", "Broadcaster", "1947–1960")],
    121: [("Bob Murphy", "Bob Murphy (sportscaster)", "Broadcaster", "1962–2003"),
          ("Ralph Kiner", "Ralph Kiner", "Broadcaster", "1962–2013"),
          ("Lindsey Nelson", "Lindsey Nelson", "Broadcaster", "1962–1978"),
          ("Joan Whitney Payson", "Joan Whitney Payson", "Founding owner", "1962–1975"),
          ("Howie Rose", "Howie Rose", "Radio voice", "1995–2024")],
    147: [("Mel Allen", "Mel Allen", "Broadcaster", "1939–1964"),
          ("Phil Rizzuto", "Phil Rizzuto", "Shortstop & broadcaster", "1941–1996"),
          ("Bob Sheppard", "Bob Sheppard", "Public address announcer", "1951–2007"),
          ("John Sterling", "John Sterling (sportscaster)", "Radio voice", "1989–2024"),
          ("Jacob Ruppert", "Jacob Ruppert", "Owner", "1915–1939"),
          ("George Steinbrenner", "George Steinbrenner", "Owner", "1973–2010")],
    143: [("Harry Kalas", "Harry Kalas", "Broadcaster", "1971–2009"),
          ("Richie Ashburn", "Richie Ashburn", "Center fielder & broadcaster", "1948–1997"),
          ("By Saam", "By Saam", "Broadcaster", "1939–1975"),
          ("Phillie Phanatic", "Phillie Phanatic", "Mascot", "1978–")],
    134: [("Bob Prince", "Bob Prince", "Broadcaster", "1948–1975"),
          ("Lanny Frattare", "Lanny Frattare", "Broadcaster", "1976–2008"),
          ("Barney Dreyfuss", "Barney Dreyfuss", "Owner", "1900–1932"),
          ("Branch Rickey", "Branch Rickey", "General manager", "1950–1955")],
    135: [("Jerry Coleman", "Jerry Coleman", "Broadcaster", "1972–2013"),
          ("Ray Kroc", "Ray Kroc", "Owner", "1974–1984"),
          ("Ted Leitner", "Ted Leitner", "Broadcaster", "1980–2020")],
    137: [("Russ Hodges", "Russ Hodges", "Broadcaster", "1949–1970"),
          ("Lon Simmons", "Lon Simmons", "Broadcaster", "1958–2002"),
          ("Jon Miller", "Jon Miller", "Broadcaster", "1997–"),
          ("John McGraw", "John McGraw", "Manager", "1902–1932"),
          ("Horace Stoneham", "Horace Stoneham", "Owner", "1936–1976"),
          ("Mike Krukow", "Mike Krukow", "Pitcher & broadcaster", "1983–"),
          ("Duane Kuiper", "Duane Kuiper", "Infielder & broadcaster", "1982–")],
    136: [("Dave Niehaus", "Dave Niehaus", "Broadcaster", "1977–2010"),
          ("Rick Rizzs", "Rick Rizzs", "Broadcaster", "1983–2025"),
          ("Hiroshi Yamauchi", "Hiroshi Yamauchi", "Owner", "1992–2004")],
    138: [("Jack Buck", "Jack Buck", "Broadcaster", "1954–2001"),
          ("Harry Caray", "Harry Caray", "Broadcaster", "1945–1969"),
          ("Mike Shannon", "Mike Shannon", "Player & broadcaster", "1962–2021"),
          ("Branch Rickey", "Branch Rickey", "General manager", "1917–1942"),
          ("Gussie Busch", "August Anheuser Busch Jr.", "Owner", "1953–1989")],
    139: [("Vince Naimoli", "Vince Naimoli", "Founding owner", "1995–2007"),
          ("Dewayne Staats", "Dewayne Staats", "Broadcaster", "1998–"),
          ("Andrew Friedman", "Andrew Friedman", "Executive", "2005–2014")],
    140: [("Mark Holtz", "Mark Holtz", "Broadcaster", "1982–1996"),
          ("Eric Nadel", "Eric Nadel", "Radio voice", "1979–"),
          ("Nolan Ryan", "Nolan Ryan", "Pitcher & club president", "1989–2013"),
          ("George W. Bush", "George W. Bush", "Managing partner", "1989–1998")],
    141: [("Tom Cheek", "Tom Cheek", "Broadcaster", "1977–2004"),
          ("Jerry Howarth", "Jerry Howarth", "Broadcaster", "1981–2017"),
          ("Pat Gillick", "Pat Gillick", "General manager", "1978–1994"),
          ("Paul Beeston", "Paul Beeston", "President", "1976–2015")],
    120: [("Dave Van Horne", "Dave Van Horne", "Expos broadcaster", "1969–2000"),
          ("Charles Bronfman", "Charles Bronfman", "Founding owner (Expos)", "1968–1990"),
          ("Youppi!", "Youppi!", "Expos mascot", "1979–2004"),
          ("Charlie Slowes", "Charlie Slowes", "Radio voice", "2005–")],
}


# Signature calls, shown as a quote on the broadcaster's card.
CALLS = {
    "Vin Scully": "It's time for Dodger baseball!", "Red Barber": "Sittin' in the catbird seat.",
    "Harry Caray": "Holy cow!", "Mel Allen": "How about that!", "Phil Rizzuto": "Holy cow!",
    "John Sterling": "Thuuuuh Yankees win!", "Russ Hodges": "The Giants win the pennant!",
    "Lon Simmons": "Tell it goodbye!", "Jack Buck": "Go crazy, folks! Go crazy!",
    "Mike Shannon": "Get up, baby! Get up! Oh yeah!", "Dave Niehaus": "My, oh my!",
    "Ernie Harwell": "Long gone!", "Bob Uecker": "Get up, get up, get outta here, gone!",
    "Harry Kalas": "That ball is outta here!", "Bob Prince": "We had 'em all the way!",
    "Marty Brennaman": "And this one belongs to the Reds!",
    "Joe Nuxhall": "This is the old left-hander, rounding third and heading for home.",
    "Jerry Coleman": "Oh, doctor! You can hang a star on that baby!", "Chuck Thompson": "Ain't the beer cold!",
    "Jack Brickhouse": "Hey-hey!", "Tom Cheek": "Touch 'em all, Joe! You'll never hit a bigger home run in your life!",
    "Hawk Harrelson": "You can put it on the board... yes!", "Milo Hamilton": "Holy Toledo!",
    "Bill King": "Holy Toledo!", "Mark Holtz": "Hello, win column!", "Ned Martin": "Mercy!",
    "Joe Castiglione": "Can you believe it?", "Jimmy Dudley": "So long and good luck, y'all.",
    "Rick Rizzs": "Goodbye, baseball!", "Howie Rose": "Put it in the books!", "Pat Hughes": "Cubs win! Cubs win!",
    "Mike Krukow": "Grab some pine, meat!", "Duane Kuiper": "Get up, get up, get outta here, gone!", "Dave Van Horne": "Up, up and away!", "Dick Enberg": "Oh my!", "Lanny Frattare": "Raise the Jolly Roger!",
}


def team_seasons(tid):
    d = mlb(f"/teams/{tid}/stats?stats=yearByYear&group=pitching&sportId=1")
    out = {}
    for s in (d.get("stats") or [{}])[0].get("splits", []):
        st = s["stat"]
        if st.get("wins", 0) + st.get("losses", 0):
            out[int(s["season"])] = (st["wins"], st["losses"])
    return out


def managers(tid, champs):
    seasons = team_seasons(tid)
    years = sorted(y for y in seasons if y < 2026)
    rosters = {}
    with cf.ThreadPoolExecutor(8) as ex:
        for y, d in zip(years, ex.map(lambda y: mlb(f"/teams/{tid}/roster?rosterType=coach&season={y}"), years)):
            # one entry per person (the API sometimes lists a manager twice in a season)
            rosters[y] = list({r["person"]["id"]: r["person"] for r in d.get("roster", []) if r.get("jobId") == "MNGR"}.values())
    by = {}
    for y in years:
        ms = rosters.get(y, [])
        for p in ms:
            m = by.setdefault(p["id"], {"id": p["id"], "name": p["fullName"], "years": [], "W": 0, "L": 0,
                                        "titles": [], "pennants": [], "solo": 0})
            m["years"].append(y)
            if len(ms) == 1:  # only credit full seasons
                w, l = seasons[y]
                m["W"] += w; m["L"] += l; m["solo"] += 1
                c = champs.get(str(y))
                if c and c["winner"]["id"] == tid:
                    m["titles"].append(y)
                elif c and c["loser"]["id"] == tid:
                    m["pennants"].append(y)
    out = []
    for m in by.values():
        ys = m["years"]
        m["from"], m["to"], m["seasons"] = ys[0], ys[-1], len(ys)
        out.append(m)
    out.sort(key=lambda m: m["from"])
    return out, len([y for y in years if rosters.get(y)])


# Lead photos that don't suit the card (e.g. a childhood portrait): show initials instead.
NO_PHOTO = {"Gussie Busch"}
# Commons portraits for people whose Wikipedia article has no usable lead photo.
PHOTO_FILES = {
    "Powel Crosley Jr.": "File:Powel Crosley, Jr. c. 1940 (crop).jpg",
    "Roy Hofheinz": "File:Roy Hofheinz (Judge, mayor).jpg",
    "Walter O'Malley": "File:Walter Francis O'Malley (1903-1979) in 1926 with background removed.png",
    "Phillie Phanatic": "File:Phillie Phanatic participates in Star Wars Night.JPG",
}


def person(name, title, role, years):
    s = summary(title)
    im = commons_image(s) if s.get("title") and name not in NO_PHOTO else None
    if not im and name in PHOTO_FILES:
        f = commons_files([PHOTO_FILES[name]]).get(PHOTO_FILES[name])
        im = f and {k: f[k] for k in ("src", "file", "w", "h")}
    return {"name": name, "role": role, "years": years, "blurb": first_sentences(s.get("extract"), 260),
            "url": (s.get("content_urls") or {}).get("desktop", {}).get("page"), "photo": im, "call": CALLS.get(name)}


def main():
    champs = json.load(open(os.path.join(ROOT, "data", "champions.json")))
    out = {}
    for tid in PEOPLE:
        ms, covered = managers(tid, champs)
        with cf.ThreadPoolExecutor(2) as ex:
            ppl = list(ex.map(lambda a: person(*a), PEOPLE[tid]))
        out[str(tid)] = {"managers": ms, "people": ppl}
        print(tid, f"{len(ms)} managers over {covered} seasons;", sum(1 for p in ppl if p["photo"]), "/", len(ppl), "people photos", flush=True)
    with open(os.path.join(ROOT, "data", "people.json"), "w") as fh:
        json.dump(out, fh, indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main()
