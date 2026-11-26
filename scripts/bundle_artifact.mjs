// Build dist/: a self-contained copy of the site for hosts that block outside requests
// (e.g. a claude.ai artifact). Every MLB API response the page asks for is pre-fetched,
// trimmed to the fields app.js reads, and stored per team under its request path; logos,
// portraits and archive photos are downloaded, recompressed and embedded as data: URIs.
//
//   SHARP_FROM=/path/with/node_modules/sharp node scripts/bundle_artifact.mjs
//
// Responses are cached in $DTM_CACHE (shared with the Python build scripts).
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DIST = path.join(ROOT, "dist");
const CACHE = process.env.DTM_CACHE || path.join(ROOT, ".cache");
const API = "https://statsapi.mlb.com/api/v1";
const UA = { "User-Agent": "DugoutTimeMachine/0.1 (personal non-commercial baseball history prototype)" };
const sharp = createRequire(process.env.SHARP_FROM ? path.join(process.env.SHARP_FROM, "x.js") : import.meta.url)("sharp");
fs.mkdirSync(CACHE, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => createHash("md5").update(s).digest("hex");
const readJSON = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));

async function get(p) {
  const f = path.join(CACHE, md5(p) + ".json");
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(API + p, { signal: AbortSignal.timeout(30000) });
      if (r.ok) { const d = await r.json(); fs.writeFileSync(f, JSON.stringify(d)); return d; }
      if (r.status === 404) return {};
    } catch {}
    await sleep(1500 * (attempt + 1));
  }
  console.error("FAIL", p);
  return {};
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

// ---------- images ----------
const IMG_CACHE = path.join(CACHE, "img");
fs.mkdirSync(IMG_CACHE, { recursive: true });
// No single image may stall the build: give each one a minute, then skip it.
function image(url, opts) {
  let timer;
  const watchdog = new Promise((res) => { timer = setTimeout(() => { console.error("IMG TIMEOUT", url); res(null); }, 60000); });
  return Promise.race([imageInner(url, opts).finally(() => clearTimeout(timer)), watchdog]);
}
async function imageInner(url, { width, quality = 68, wiki = false } = {}) {
  const key = md5(url + "|" + width + "|" + quality);
  const f = path.join(IMG_CACHE, key + ".jpg");
  if (!fs.existsSync(f) && wiki && process.env.DTM_CACHED_IMAGES_ONLY) return null; // skip throttled hosts
  if (!fs.existsSync(f)) {
    let buf = null;
    for (let attempt = 0; attempt < 5 && !buf; attempt++) {
      try {
        if (wiki) await sleep(1000);
        const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
        if (r.ok) buf = Buffer.from(await r.arrayBuffer());
        else if (r.status === 404) break;
        else await sleep(Math.min(20, +r.headers.get("retry-after") || 3) * 1000 * (attempt + 1));
      } catch { await sleep(2000); }
    }
    if (!buf) { console.error("IMG FAIL", url); return null; }
    const jpg = await sharp(buf).flatten({ background: "#f4ecd8" }).resize({ width, withoutEnlargement: true }).jpeg({ quality, mozjpeg: true }).toBuffer();
    fs.writeFileSync(f, jpg);
  }
  return "data:image/jpeg;base64," + fs.readFileSync(f).toString("base64");
}
async function svg(url) {
  const f = path.join(IMG_CACHE, md5(url) + ".svg");
  if (!fs.existsSync(f)) {
    const r = await fetch(url);
    if (!r.ok) return null;
    fs.writeFileSync(f, await r.text());
  }
  return "data:image/svg+xml;base64," + fs.readFileSync(f).toString("base64");
}
// Wikimedia asks automated clients for standard thumbnail sizes rather than full originals.
function wikiThumb(src, size, origWidth) {
  const m = src.match(/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/(?:thumb\/)?(\w\/\w\w)\/([^/]+)(?:\/[^/]+)?$/);
  if (!m || (origWidth && origWidth <= size)) return src;
  const [, base, dir, name] = m;
  const out = `${base}/thumb/${dir}/${name}/${size}px-${name}`;
  return /\.tiff?$/i.test(name) ? out.replace(/\/(\d+)px-([^/]+)$/, "/lossy-page1-$1px-$2.jpg") : /\.svg$/i.test(name) ? out + ".png" : out;
}
const headshot = (id, w) => `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_${w},q_auto:best/v1/people/${id}/headshot/67/current`;

// ---------- trimming (keep only what app.js reads) ----------
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o?.[k] !== undefined).map((k) => [k, o[k]]));
const HIT = ["plateAppearances", "ops", "avg", "homeRuns", "rbi", "stolenBases"];
const PIT = ["inningsPitched", "era", "wins", "losses", "strikeOuts", "saves"];

function trimRoster(d, tid, keepIds) {
  const roster = [];
  for (const r of d.roster || []) {
    const p = r.person;
    const stats = (p.stats || []).map((st) => {
      const splits = st.splits || [];
      const sp = splits.find((x) => x.team?.id === tid) || (splits.length === 1 ? splits[0] : null);
      if (!sp) return null;
      const keys = st.group.displayName === "hitting" ? HIT : PIT;
      return { group: { displayName: st.group.displayName }, splits: [{ team: { id: sp.team?.id ?? tid }, stat: pick(sp.stat, keys) }] };
    }).filter(Boolean);
    // keep regulars with stats; everyone else only as an id (for Hall of Fame matching)
    const pa = stats.find((s) => s.group.displayName === "hitting")?.splits[0].stat.plateAppearances || 0;
    const ip = parseFloat(stats.find((s) => s.group.displayName === "pitching")?.splits[0].stat.inningsPitched || 0);
    const sv = stats.find((s) => s.group.displayName === "pitching")?.splits[0].stat.saves || 0;
    const useful = pa >= 100 || ip >= 25 || sv >= 10;
    if (!useful && !keepIds.has(p.id)) { roster.push({ person: { id: p.id } }); continue; }
    roster.push({ person: { id: p.id, fullName: p.fullName, primaryPosition: pick(p.primaryPosition, ["code", "abbreviation"]), stats: useful ? stats : [] } });
  }
  return { roster };
}

function trimStandings(d, tid) {
  for (const rec of d.records || []) {
    const tr = (rec.teamRecords || []).find((t) => t.team.id === tid);
    if (tr) return { records: [{ division: rec.division ? { id: rec.division.id } : undefined, league: rec.league ? { id: rec.league.id } : undefined,
      teamRecords: [{ team: { id: tid }, divisionRank: tr.divisionRank, leagueRank: tr.leagueRank }] }] };
  }
  return { records: [] };
}

function trimPost(d, tid) {
  const series = [];
  for (const s of d.series || []) {
    const games = (s.games || []).filter((g) => g.status?.abstractGameState === "Final" || g.status?.detailedState?.startsWith("Final"));
    if (!games.length) continue;
    const last = games.at(-1);
    if (last.teams.home.team.id !== tid && last.teams.away.team.id !== tid) continue;
    const g = (x) => ({ gameDate: x.gameDate, seriesDescription: x.seriesDescription, status: { abstractGameState: "Final" },
      teams: Object.fromEntries(["home", "away"].map((k) => [k, { team: pick(x.teams[k].team, ["id", "name"]), leagueRecord: pick(x.teams[k].leagueRecord, ["wins", "losses"]) }])) });
    series.push({ games: games.length > 1 ? [g(games[0]), g(last)] : [g(last)] });
  }
  return { series };
}

// ---------- main ----------
const champions = readJSON("data/champions.json");
const legends = readJSON("data/legends.json");
const history = readJSON("data/history.json");
const modern = fs.existsSync(path.join(ROOT, "data/modern.json")) ? readJSON("data/modern.json") : {};
const photos = fs.existsSync(path.join(ROOT, "data/photos.json")) ? readJSON("data/photos.json") : {};
const year = new Date().getFullYear();
const teamsRes = await get(`/teams?sportId=1&season=${year}`);
const teams = teamsRes.teams.filter((t) => t.sport?.id === 1);
const only = process.env.DTM_TEAMS ? new Set(process.env.DTM_TEAMS.split(",").map(Number)) : null;

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, "data", "bundle"), { recursive: true });

const logos = {};
await pool(teams, 6, async (t) => { logos[t.id] = await svg(`https://www.mlbstatic.com/team-logos/${t.id}.svg`); });
fs.writeFileSync(path.join(DIST, "data/bundle/teams.json"), JSON.stringify({
  teams: teams.map((t) => ({ ...pick(t, ["id", "name", "teamName", "franchiseName", "locationName", "firstYearOfPlay", "abbreviation"]), sport: { id: 1 } })),
  logos,
}));

let total = 0;
for (const t of teams) {
  if (only && !only.has(t.id)) continue;
  const tid = t.id, api = {}, imgs = {};
  const hitP = `/teams/${tid}/stats?stats=yearByYear&group=hitting&sportId=1`;
  const pitP = `/teams/${tid}/stats?stats=yearByYear&group=pitching&sportId=1`;
  const histP = `/teams/${tid}/history`;
  const [hit, pit, hist] = await Promise.all([get(hitP), get(pitP), get(histP)]);
  api[hitP] = { stats: [{ splits: hit.stats[0].splits.map((s) => ({ season: s.season, stat: pick(s.stat, ["homeRuns", "avg"]) })) }] };
  api[pitP] = { stats: [{ splits: pit.stats[0].splits.map((s) => ({ season: s.season, stat: pick(s.stat, ["wins", "losses", "era"]) })) }] };
  api[histP] = { teams: hist.teams.map((x) => pick(x, ["season", "name", "teamName", "clubName", "franchiseName", "locationName"])) };
  const seasons = pit.stats[0].splits.filter((s) => s.stat.wins + s.stat.losses > 0).map((s) => +s.season);

  const hof = (history[tid] || {}).hof || [];
  const hofIds = new Set(hof.map((h) => h.id));
  await pool(seasons, 8, async (y) => {
    const rp = `/teams/${tid}/roster?season=${y}&rosterType=fullSeason&hydrate=person(stats(group=[hitting,pitching],type=season,season=${y}))`;
    const sp = `/standings?leagueId=103,104&season=${y}&standingsTypes=regularSeason`;
    const pp = `/schedule/postseason/series?sportId=1&season=${y}`;
    const [r, s, p] = await Promise.all([get(rp), get(sp), get(pp)]);
    api[rp] = trimRoster(r, tid, hofIds);
    api[sp] = trimStandings(s, tid);
    api[pp] = trimPost(p, tid);
  });
  // Hall of Famers: tenure lookups + plaque portraits
  await pool(hof, 6, async (h) => {
    const pp = `/people/${h.id}/stats?stats=yearByYear&group=hitting,pitching`;
    const d = await get(pp);
    api[pp] = { stats: (d.stats || []).map((st) => ({ splits: (st.splits || []).filter((x) => x.team?.id === tid).map((x) => ({ season: x.season, team: { id: tid } })) })) };
    imgs[h.id] = await image(headshot(h.id, 180), { width: 160, quality: 70 });
  });
  // legends: Commons portrait, else MLB headshot
  const ph = photos[tid] || { archive: [], legends: {} };
  const outPhotos = { archive: [], legends: {} };
  await pool((legends[tid] || []).slice(0, 5), 1, async (p) => {
    const lp = ph.legends?.[p.id];
    if (lp) {
      const src = await image(wikiThumb(lp.src, 500, lp.w), { width: 420, quality: 70, wiki: true });
      if (src) { outPhotos.legends[p.id] = { ...lp, src }; return; }
    }
    imgs[p.id] = await image(headshot(p.id, 360), { width: 360, quality: 72 });
  });
  // modern stars: a hand-picked Commons portrait, else MLB's headshot when the club was the player's last stop
  outPhotos.modern = {};
  await pool(((modern[tid] || {}).players || []).slice(0, 10), 1, async (p) => {
    const mp = ph.modern?.[p.id];
    if (mp) {
      const src = await image(wikiThumb(mp.src, 500, mp.w), { width: 420, quality: 70, wiki: true });
      if (src) { outPhotos.modern[p.id] = { ...mp, src }; return; }
    }
    if (p.home && !imgs[p.id]) imgs[p.id] = await image(headshot(p.id, 360), { width: 360, quality: 72 });
  });
  // scrapbook
  const arch = await pool(ph.archive || [], 1, async (a) => {
    const src = await image(a.src, { width: 820, quality: 64, wiki: true });
    return src ? { ...a, src } : null;
  });
  outPhotos.archive = arch.filter(Boolean);
  for (const k of Object.keys(imgs)) if (!imgs[k]) delete imgs[k];

  const file = path.join(DIST, "data/bundle", `team-${tid}.json`);
  fs.writeFileSync(file, JSON.stringify({ api, imgs, photos: outPhotos }));
  const kb = Math.round(fs.statSync(file).size / 1024);
  total += kb;
  console.log(`${t.abbreviation.padStart(4)} ${seasons.length} seasons, ${outPhotos.archive.length} photos, ${Object.keys(outPhotos.legends).length}/5 portraits, ${kb} KB`);
}

// static files
for (const f of ["styles.css", "app.js", "data/champions.json", "data/legends.json", "data/history.json", "data/modern.json"]) {
  fs.mkdirSync(path.dirname(path.join(DIST, f)), { recursive: true });
  fs.copyFileSync(path.join(ROOT, f), path.join(DIST, f));
}
fs.writeFileSync(path.join(DIST, "data/photos.json"), "{}"); // per-team photos ship inside each bundle
// artifact pages are wrapped in their own <html>/<head>/<body>: keep only the content
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8")
  .replace(/<!doctype html>\s*/i, "").replace(/<\/?html[^>]*>\s*/gi, "").replace(/<\/?head>\s*/gi, "").replace(/<\/?body>\s*/gi, "")
  .replace(/<meta charset[^>]*>\s*/i, "").replace(/<meta name="viewport"[^>]*>\s*/i, "").replace(/<link rel="icon"[^>]*>\s*/i, "");
fs.writeFileSync(path.join(DIST, "index.html"), html);
console.log(`total bundle ${Math.round(total / 1024)} MB`);
