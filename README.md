# The Grandstand Almanac

*A franchise almanac of the grand old game.* Pick a ball club and leaf through its whole history: every season, its legends, its ballparks and its brightest days. It's meant to be a fun ten minutes for a baseball fan.

## What's inside (v3)

The page is styled like an old almanac: parchment, wood-type headlines, bunting and a manual scoreboard. Each club's almanac is read **one chapter at a time**: a numbered progress strip runs across the top, and Back and Next buttons sit in the bottom corners. The arrow keys turn pages too, and the address bar remembers the chapter (`#team=147&page=legends`).

| Chapter | What it shows |
|---|---|
| **The Ledger** | The scoreboard (all-time record, titles, pennants, best and worst seasons, drought, Hall of Famers), then every season as a bar (distance from .500), with the club's names and ballparks underneath. Hover a year for its record, skipper, stars and awards. Below it: the golden decade, the lean years, the longest run of winning seasons. |
| **Legends** | The top 10 players by an era-adjusted, WAR-style "legend value", as tobacco cards, plus the next three in line. Every portrait shows the player **in this club's uniform**: a hand-picked Commons photo, or MLB's own headshot. |
| **The Dugout & the Booth** | The longest-serving managers with their records and titles, every manager in club history, and the club's voices and builders: broadcasters (with their signature calls), owners, executives and a few beloved characters. |
| **Numbers on the Wall** | Retired numbers as banners hung from the rafters. Jackie Robinson's 42 hangs in gold on the Dodgers' wall. |
| **In Cooperstown** | Bronze plaques for every Hall of Famer enshrined with the club. |
| **The Trophy Case** | MVPs, Cy Youngs and Rookies of the Year, plus Gold Gloves and Silver Sluggers listed by player. |
| **October** | Every World Series the club won: the opponent, the series score, each game's result, where it was clinched, the World Series MVP, the manager, the stars on the roster and a photo when one exists. Clubs without a title skip the chapter. |
| **Home Fields** | Every ballpark the club called home, as postcards, with its years, the club's record there and the titles won there. |
| **The Scrapbook** | 360-odd hand-picked public-domain and freely licensed photos across the 30 clubs, filterable by decade, with a lightbox you can page through. |
| **The League** | A title-drought scoreboard and a wall of every champion's pennant since 1903. |

## Run

No build step and no backend. The MLB Stats API allows cross-origin requests, so the browser calls it directly.

```sh
cd ~/src/baseball && python3 -m http.server 8765   # then open http://localhost:8765
```

Deep links work: `#team=147`, `#team=147&page=october`, `#view=league`.

## Data

Live per-season data comes from `statsapi.mlb.com`. The history layers are baked into `data/` by scripts. Re-run them after each season. All of them cache API responses (set `DTM_CACHE` to choose where).

| file | script | what |
|---|---|---|
| `data/champions.json` | `scripts/build_champions.py` | every World Series: winner, loser, series score, each game's score and ballpark, and the World Series MVP |
| `data/legends.json` | `scripts/build_legends.py` | top 13 players per franchise by legend value (10 cards, 3 more named below them) |
| `data/history.json` | `scripts/build_history.py` | ballparks by season (merged across renamings), MVP/Cy Young/ROY/Gold Glove/Silver Slugger winners, Hall of Famers |
| `data/photos.json` | `scripts/build_photos.py` (run after legends) | scrapbook photos, in-uniform legend portraits and ballpark photos (picks live in `scripts/scrapbook_picks.py`) |
| `data/people.json` | `scripts/build_people.py` | every manager by season from the Stats API, plus hand-picked broadcasters, owners and executives |
| `data/retired.json` | `scripts/build_retired.py` | retired numbers, parsed from Wikipedia's list |

**Legend value** is a WAR-style estimate, since the Stats API has no WAR. It is built from each player's seasons with the franchise and normalised to each season's league:
- **Hitters:** batting runs from fixed wOBA weights, plus a position adjustment and replacement credit.
- **Pitchers:** league RA9 vs. the pitcher's RA9 (runs allowed, because old seasons lack earned runs), times innings.
- **Wins:** runs convert to wins using that era's runs-per-win.

It ignores defense and park effects, but it lines up with the usual franchise leaders: Ruth, Mantle and Gehrig; Mays, Bonds and Ott; Cobb, Wagner, Musial, Aaron.

**Photos** come only from Wikimedia Commons, which means public domain or freely licensed. There are two sources. The first is the lead image of a hand-picked list of Wikipedia articles per club (`MOMENTS`, plus the World Series article for every pennant). The second is `SCRAPBOOK` in `scripts/scrapbook_picks.py`: Commons files chosen by eye from searches on every name the club has played under, its ballparks, its legends and its famous moments, each with a caption. Library of Congress (Bain News Service) glass negatives and 1909–1913 tobacco cards cover the early years.

Legend portraits must show the player in the club's uniform. `LEGEND_PHOTOS` overrides the Wikipedia lead photo when it is a suit, a retirement-ceremony shot or another club's uniform. `None` there means "use MLB's headshot", which is always in uniform (usually this club's, though not always). A player who is a legend for two clubs (Randy Johnson, Tris Speaker, Eddie Collins, A-Rod, Miguel Cabrera) gets a `(team id, person id)` key per club. Commons titles are often generic, so check a file's description before swapping it in. `PARK_PHOTOS` fills in ballparks whose article has no usable lead image, and `FACE_PHOTOS` gives a portrait to managers and Hall of Famers whose MLB headshot is the blank silhouette (`"mlb83"` uses MLB's newer headshot set). `PHOTO_FOCUS` aims the crop when the subject is off-centre. In `build_people.py`, `PHOTO_FILES` does the same job for broadcasters and owners. Wikipedia rate-limits anonymous clients, so the scripts are throttled and can take a while.

MLB data is subject to MLB Advanced Media's terms (http://gdx.mlb.com/components/copyright.txt). This is a personal, non-commercial fan project.
