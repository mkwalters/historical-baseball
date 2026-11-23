# Dugout Time Machine

*A franchise almanac of the grand old game.* Pick a ball club and leaf through its whole history: every season, its legends, its ballparks and its brightest days. It's meant to be a fun ten minutes for a baseball fan.

## What's inside (v2)

The page is styled like an old almanac: parchment, wood-type headlines, bunting, a manual scoreboard and a felt pennant.

| Section | What it shows |
|---|---|
| **Title page** | A felt pennant, the club's former names, and an archive photo. |
| **Scoreboard** | All-time record, titles, pennants, best and worst seasons, title drought, Hall of Famers. |
| **I. The Ledger** | Every season as a bar (distance from .500). Gold means World Champions, light gold means pennant. Bands show the club's name and its home ballpark over time. Red dots mark years with a scrapbook photo. |
| **The Dugout Gazette** | Click any season for a generated newspaper front page: headline, lead story, a "Stars of the Season" box score, Hall of Famers on the roster, the October report, and the World Series result elsewhere in the league. |
| **II. Franchise Legends** | The top 5 players by an era-adjusted, WAR-style "legend value", shown as tobacco cards. Hover a card to see their era; click it for the paper from their best season. |
| **III. In Cooperstown** | Bronze plaques for every Hall of Famer enshrined with the club. Click a plaque to jump to their tenure. |
| **IV. The Trophy Case** | MVPs, Cy Youngs and Rookies of the Year. |
| **V. The Scrapbook** | Public-domain and freely licensed photos of old ballparks, pennant winners and famous moments. |
| **Guess the Year** | A five-round game: name the season from its record, ballpark and best hitter's line. |
| **The League** | A title-drought scoreboard and a wall of every champion's pennant since 1903. |

## Run

No build step and no backend. The MLB Stats API allows cross-origin requests, so the browser calls it directly.

```sh
cd ~/src/baseball && python3 -m http.server 8765   # then open http://localhost:8765
```

Deep links work: `#team=147&season=1927`, `#view=league`.

## Data

Live per-season data comes from `statsapi.mlb.com`. The history layers are baked into `data/` by scripts. Re-run them after each season. All of them cache API responses (set `DTM_CACHE` to choose where).

| file | script | what |
|---|---|---|
| `data/champions.json` | `scripts/build_champions.py` | every World Series result |
| `data/legends.json` | `scripts/build_legends.py` | top 8 players per franchise by legend value |
| `data/history.json` | `scripts/build_history.py` | ballparks by season (merged across renamings), MVP/Cy Young/ROY winners, Hall of Famers |
| `data/photos.json` | `scripts/build_photos.py` (run after legends) | scrapbook photos + legend portraits from Wikipedia |

**Legend value** is a WAR-style estimate, since the Stats API has no WAR. It is built from each player's seasons with the franchise and normalised to each season's league:
- **Hitters:** batting runs from fixed wOBA weights, plus a position adjustment and replacement credit.
- **Pitchers:** league RA9 vs. the pitcher's RA9 (runs allowed, because old seasons lack earned runs), times innings.
- **Wins:** runs convert to wins using that era's runs-per-win.

It ignores defense and park effects, but it lines up with the usual franchise leaders: Ruth, Mantle and Gehrig; Mays, Bonds and Ott; Cobb, Wagner, Musial, Aaron.

**Photos** are used only when the Wikipedia article's lead image is hosted on Wikimedia Commons, which means public domain or freely licensed. Logos and SVGs are skipped. The scrapbook list per franchise is hand-curated in `build_photos.py` (`MOMENTS`), plus the World Series article for every pennant. Wikipedia rate-limits anonymous clients, so the script is throttled and can take a while. If a legend has no free photo, the card falls back to MLB's headshot.

MLB data is subject to MLB Advanced Media's terms (http://gdx.mlb.com/components/copyright.txt). This is a personal, non-commercial fan project.
