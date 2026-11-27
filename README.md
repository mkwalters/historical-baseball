# The Grandstand Almanac

*A franchise almanac of the grand old game.* Pick a ball club and leaf through its whole history: every season, its legends, its ballparks and its brightest days. It's meant to be a fun ten minutes for a baseball fan.

## What's inside (Vol. IV)

The page is styled like an old almanac: parchment, wood-type headlines, bunting and a manual scoreboard.

**The front page** lists the thirty clubs by division, deals a random club on request, and lays out four loose photos from four clubs' scrapbooks (reshuffled every visit). **Look up a name** in the masthead searches every legend, modern star, Hall of Famer, retired number, award winner, manager and broadcaster across all thirty clubs, and opens the right club at the right chapter.

Each club's almanac is read **one chapter at a time**: a numbered progress strip sticks to the top, and Back and Next buttons sit under each chapter. The arrow keys turn pages too. The address bar remembers the club and chapter (`#team=147&page=legends`), and the browser's Back and Forward buttons walk through the chapters you've read.

| Chapter | What it shows |
|---|---|
| **The Ledger** | The scoreboard (all-time record, titles, pennants, best and worst seasons, drought, Hall of Famers), then every season as a bar (distance from .500), with the club's names and ballparks underneath. Hover a year for its record, skipper, stars and awards; click (or tap) one to pin its **season card**, with the year's rank among all the club's seasons, its World Series result, team ERA, home runs and average, and any scrapbook photos from that year. Below it: the golden decade, the lean years, the longest run of winning seasons. |
| **Legends** | The top 10 players by an era-adjusted, WAR-style "legend value", as tobacco cards, plus the next three in line. Every portrait shows the player **in this club's uniform**: a hand-picked Commons photo, or MLB's own headshot. |
| **The Dugout & the Booth** | The longest-serving managers with their records and titles, every manager in club history, and the club's voices and builders: broadcasters (with their signature calls), owners, executives and a few beloved characters. |
| **Numbers on the Wall** | Retired numbers as banners hung from the rafters. Jackie Robinson's 42 hangs in gold on the Dodgers' wall. |
| **In Cooperstown** | Bronze plaques for every Hall of Famer enshrined with the club. |
| **The Trophy Case** | MVPs, Cy Youngs and Rookies of the Year, plus Gold Gloves and Silver Sluggers listed by player. Then the club's **no-hitters** since 1901 (perfect, combined and postseason ones marked) and the ones thrown against it. Pick one for its scorecard: the inning-by-inning line score and each pitcher's line. |
| **October** | Every World Series the club won: the opponent, the series score, each game's result, where it was clinched, the World Series MVP, the manager, the stars on the roster and a photo when one exists. Pennants that ended in a World Series loss follow, a line apiece with the game scores. Clubs that have never reached the Series skip the chapter. |
| **Home Fields** | Every ballpark the club called home, as postcards, with its years, the club's record there and the titles won there. |
| **The Scrapbook** | 360-odd hand-picked public-domain and freely licensed photos across the 30 clubs, filterable by decade, with a lightbox you can page through. |
| **Modern Stars** | The club's best players of the last 20 seasons, ranked by real WAR earned with the club. A player needs at least 4 seasons there to qualify, unless he played for the club in the latest season. Ten modern cards, then a season-by-season WAR heatmap of the top 15, with the best single season, the longest stay and the best player on the latest club. |

**The League** is a second book, read the same way (progress strip, Back and Next, arrow keys, `#view=league&page=climb`). It compares the thirty clubs:

| Bulletin | What it shows |
|---|---|
| **All-Time Standings** | Every club ranked by winning percentage, as bars either side of .500, with won–lost and games over or under. Switch between all time, since 1969, since 2000 and the last ten seasons. |
| **The Long Climb** | A line for every club: games over .500, added up season after season. The two leaders and the two cellar-dwellers are lit to start; hover any line to read it, click it (or a logo below) to keep it lit. |
| **Decade by Decade** | A heatmap of each club's winning percentage in every decade, blue for winners and red for losers, with stars for World Series won. |
| **Banner Years & Bad Ones** | The fifteen best and fifteen worst seasons since 1901 (100 games or more). |
| **The No-Hit Ledger** | A block for every no-hitter since 1901, stacked by season (gold for perfect games; pick one for its scorecard), then every club's no-hitters thrown against those suffered. |
| **The Long Wait** | A title-drought scoreboard. |
| **Champions** | A wall of every champion's pennant since 1903; pick one to see the series game by game. |
| **Honor Roll** | A sortable table of titles, pennants, Hall of Famers, retired numbers and major awards. |

## Run

No build step and no backend. The MLB Stats API allows cross-origin requests, so the browser calls it directly.

```sh
cd ~/src/baseball && python3 -m http.server 8765   # then open http://localhost:8765
```

Deep links work: `#team=147`, `#team=147&page=october`, `#view=league`.

## Code

Three files, no dependencies: `index.html` (the static skeleton of every chapter), `styles.css` and `app.js` (an ES module). `app.js` runs top to bottom in this order: helpers, data access, state, boot, front page, search, books (`makeBook` runs the chapter-at-a-time reading for both the club and the League), routing, one `render…` function per club chapter, the lightbox, the League's bulletins. Anything in the page marked `data-club="<team id>"` (optionally with `data-page`) opens that club when clicked.

`scripts/bundle_artifact.mjs` builds `dist/`, an offline copy with the API responses and images embedded, for hosts that block outside requests. It sets `window.ALMANAC_BUNDLE`, which is how `app.js` knows to read `data/bundle/` instead of calling the API. `dist/` is not rebuilt automatically: re-run the script after changing the site.

## Data

Live per-season data comes from `statsapi.mlb.com`. The history layers are baked into `data/` by scripts. Re-run them after each season. All of them cache API responses (set `DTM_CACHE` to choose where).

| file | script | what |
|---|---|---|
| `data/champions.json` | `scripts/build_champions.py` | every World Series: winner, loser, series score, each game's score and ballpark, and the World Series MVP |
| `data/legends.json` | `scripts/build_legends.py` | top 13 players per franchise by legend value (10 cards, 3 more named below them) |
| `data/history.json` | `scripts/build_history.py` | ballparks by season (merged across renamings), MVP/Cy Young/ROY/Gold Glove/Silver Slugger winners, Hall of Famers |
| `data/photos.json` | `scripts/build_photos.py` (run after legends) | scrapbook photos, in-uniform legend portraits and ballpark photos (picks live in `scripts/scrapbook_picks.py`) |
| `data/people.json` | `scripts/build_people.py` | every manager by season from the Stats API, plus hand-picked broadcasters, owners and executives |
| `data/modern.json` | `scripts/build_modern.py` | each club's top 15 players of the last 20 completed seasons by WAR (the Stats API's `sabermetrics` stats), counting players with 4+ seasons there or on the latest club, with WAR by season and a stat line with the club |
| `data/retired.json` | `scripts/build_retired.py` | retired numbers, parsed from Wikipedia's list |
| `data/league.json` | `scripts/build_league.py` | every club's wins and losses in every season, for the League's charts |
| `data/nohitters.json` | `scripts/build_nohitters.py` (run after league) | every no-hitter since 1901: date, clubs (names that day), score, pitchers with innings, perfect/postseason flags. Found in each club's pitching game logs (0 hits over 9+ innings); the Stats API's game logs start in 1901 and leave out the 1914–15 Federal League |

**Legend value** is a WAR-style estimate, since the Stats API has no WAR. It is built from each player's seasons with the franchise and normalised to each season's league:
- **Hitters:** batting runs from fixed wOBA weights, plus a position adjustment and replacement credit.
- **Pitchers:** league RA9 vs. the pitcher's RA9 (runs allowed, because old seasons lack earned runs), times innings.
- **Wins:** runs convert to wins using that era's runs-per-win.

It ignores defense and park effects, but it lines up with the usual franchise leaders: Ruth, Mantle and Gehrig; Mays, Bonds and Ott; Cobb, Wagner, Musial, Aaron.

**Modern Stars** uses the WAR the Stats API publishes (batting, baserunning, fielding and position, or pitching), not the Legend estimate. A player qualifies with 4 or more seasons with the club in the window, or by playing for it in the latest season. Only seasons with the club count, a player traded midseason keeps only his share, and pitchers' batting is left out (except for two-way players). The window moves forward on its own: re-run `build_modern.py` after each season. A card shows MLB's headshot only when the club was the player's last stop, so the uniform is right. Otherwise it uses the Commons photo in `MODERN_PHOTOS`, or a plain card with his initials.

**Photos** come only from Wikimedia Commons, which means public domain or freely licensed. There are two sources. The first is the lead image of a hand-picked list of Wikipedia articles per club (`MOMENTS`, plus the World Series article for every pennant). The second is `SCRAPBOOK` in `scripts/scrapbook_picks.py`: Commons files chosen by eye from searches on every name the club has played under, its ballparks, its legends and its famous moments, each with a caption. Library of Congress (Bain News Service) glass negatives and 1909–1913 tobacco cards cover the early years.

Legend portraits must show the player in the club's uniform. `LEGEND_PHOTOS` overrides the Wikipedia lead photo when it is a suit, a retirement-ceremony shot or another club's uniform. `None` there means "use MLB's headshot", which is always in uniform (usually this club's, though not always). A player who is a legend for two clubs (Randy Johnson, Tris Speaker, Eddie Collins, A-Rod, Miguel Cabrera) gets a `(team id, person id)` key per club. Commons titles are often generic, so check a file's description before swapping it in. `PARK_PHOTOS` fills in ballparks whose article has no usable lead image, and `FACE_PHOTOS` gives a portrait to managers and Hall of Famers whose MLB headshot is the blank silhouette (`"mlb83"` uses MLB's newer headshot set). `PHOTO_FOCUS` aims the crop when the subject is off-centre. In `build_people.py`, `PHOTO_FILES` does the same job for broadcasters and owners. Wikipedia rate-limits anonymous clients, so the scripts are throttled and can take a while.

MLB data is subject to MLB Advanced Media's terms (http://gdx.mlb.com/components/copyright.txt). This is a personal, non-commercial fan project.
