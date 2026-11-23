// Dugout Time Machine v2 — a franchise almanac. Vanilla JS + the public MLB Stats API.
const API = "https://statsapi.mlb.com/api/v1";

// Bundle mode: when data/bundle/ exists (see scripts/bundle_artifact.mjs) the page runs fully offline,
// reading pre-fetched API responses and embedded images instead of calling outside hosts.
const BUNDLE = { on: false, teams: null, logos: {}, team: {}, imgs: {} };
const SILHOUETTE = "data:image/svg+xml," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 80"><rect width="60" height="80" fill="#c9b994"/><circle cx="30" cy="30" r="13" fill="#8a7a60"/><path d="M8 80c0-18 10-28 22-28s22 10 22 28z" fill="#8a7a60"/></svg>`);
const logo = (id) => (BUNDLE.on ? BUNDLE.logos[id] || "" : `https://www.mlbstatic.com/team-logos/${id}.svg`);
const headshot = (id, w = 120) => BUNDLE.on ? BUNDLE.imgs[id] || SILHOUETTE
  : `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_${w},q_auto:best/v1/people/${id}/headshot/67/current`;

async function ensureBundle(id) {
  if (!BUNDLE.on || BUNDLE.team[id]) return;
  const d = await json(`data/bundle/team-${id}.json`);
  BUNDLE.team[id] = d.api || {};
  Object.assign(BUNDLE.imgs, d.imgs || {});
  state.photos[id] = d.photos || { archive: [], legends: {} };
}

// Club primary colors (they read well on parchment).
const COLORS = {
  109: "#a71930", 133: "#003831", 144: "#13274f", 110: "#df4601", 111: "#bd3039", 112: "#0e3386",
  145: "#27251f", 113: "#c6011f", 114: "#00385d", 115: "#33006f", 116: "#0c2340", 117: "#002d62",
  118: "#004687", 108: "#ba0021", 119: "#005a9c", 146: "#0077a8", 158: "#12284b", 142: "#002b5c",
  121: "#002d72", 147: "#0c2340", 143: "#e81828", 134: "#27251f", 135: "#2f241d", 137: "#d9481a",
  136: "#0c2c56", 138: "#c41e3a", 139: "#092c5c", 140: "#003278", 141: "#134a8e", 120: "#ab0003",
};
const DIVISIONS = { 200: "AL West", 201: "AL East", 202: "AL Central", 203: "NL West", 204: "NL East", 205: "NL Central" };
const LEAGUES = { 103: "American League", 104: "National League" };

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const h = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ordinal = (n) => { n = +n; const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const pct = (w, l) => (w + l ? w / (w + l) : 0);
const fmtPct = (p) => p.toFixed(3).replace(/^0/, "");
const num = (n) => (n == null ? "?" : Number(n).toLocaleString());
const plural = (n, word, pl = word + "s") => `${n} ${n === 1 ? word : pl}`;
const listify = (a) => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a.at(-1));
const json = (url) => fetch(url).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));

// ---------- fetch with in-memory + session cache ----------
const memo = new Map();
async function get(path) {
  if (BUNDLE.on) {
    if (path.startsWith("/teams?sportId=1")) return BUNDLE.teams;
    const hit = BUNDLE.team[state.team?.id]?.[path];
    if (hit) return hit;
    throw new Error("not in bundle: " + path);
  }
  if (memo.has(path)) return memo.get(path);
  const p = (async () => {
    const key = "dtm:" + path;
    try { const c = sessionStorage.getItem(key); if (c) return JSON.parse(c); } catch {}
    const res = await fetch(API + path);
    if (!res.ok) throw new Error(`${res.status} ${path}`);
    const data = await res.json();
    try { sessionStorage.setItem(key, JSON.stringify(data)); } catch {}
    return data;
  })();
  memo.set(path, p);
  p.catch(() => memo.delete(path));
  return p;
}

// ---------- state ----------
const state = {
  teams: [], champions: {}, legends: {}, photos: {}, history: {},
  team: null, seasons: [], eras: [], parks: [], archive: [],
  selected: null, pinned: null, barW: 1,
};

async function init() {
  const b = await json("data/bundle/teams.json");
  if (b.teams) Object.assign(BUNDLE, { on: true, teams: { teams: b.teams }, logos: b.logos || {} });
  const [teamsRes, champions, legends, photos, history] = await Promise.all([
    get(`/teams?sportId=1&season=${new Date().getFullYear()}`),
    json("data/champions.json"), json("data/legends.json"), json("data/photos.json"), json("data/history.json"),
  ]);
  Object.assign(state, { champions, legends, photos, history });
  state.teams = teamsRes.teams.filter((t) => t.sport?.id === 1).sort((a, b) => a.teamName.localeCompare(b.teamName));
  renderPicker();
  renderLeague();
  $$(".tab").forEach((b) => (b.onclick = () => showView(b.dataset.view)));
  $("#home-link").onclick = (e) => { e.preventDefault(); goHome(); };

  const params = new URLSearchParams(location.hash.slice(1));
  const teamId = +(params.get("team") || 0);
  if (teamId && state.teams.some((t) => t.id === teamId)) await selectTeam(teamId, +params.get("season") || null);
  if (params.get("view") === "league") showView("league");
}

function renderPicker() {
  const el = $("#picker");
  el.innerHTML = "";
  for (const t of state.teams) {
    const b = h(`<button class="team-btn" title="${esc(t.name)}" data-id="${t.id}"><img alt="${esc(t.name)}" src="${logo(t.id)}" loading="lazy"></button>`);
    b.onclick = () => { showView("franchise"); selectTeam(t.id); };
    el.append(b);
  }
}

// Back to the front page: no club selected, team picker on top.
function goHome() {
  Object.assign(state, { team: null, seasons: [], selected: null, pinned: null });
  $$(".team-btn").forEach((b) => b.classList.remove("active"));
  $("#franchise").hidden = true;
  $("#franchise-empty").hidden = false;
  showView("franchise");
  try { history.replaceState(null, "", location.pathname + location.search); } catch {}
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showView(v) {
  $$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
  $("#view-franchise").hidden = v !== "franchise";
  $("#view-league").hidden = v !== "league";
  if (v === "franchise" && state.seasons.length) { renderTimeline(); markSelected(); }
  updateHash(v);
}
function updateHash(view = "franchise") {
  const p = new URLSearchParams();
  if (state.team) p.set("team", state.team.id);
  if (state.selected) p.set("season", state.selected);
  if (view === "league") p.set("view", "league");
  try { history.replaceState(null, "", "#" + p.toString()); } catch {}
}

// =====================================================================
// FRANCHISE
// =====================================================================
async function selectTeam(id, season = null) {
  const team = state.teams.find((t) => t.id === id);
  Object.assign(state, { team, selected: null, pinned: null, seasons: [] });
  await ensureBundle(id);
  if (state.team?.id !== id) return;
  document.documentElement.style.setProperty("--team", COLORS[id] || "#1e3557");
  $$(".team-btn").forEach((b) => b.classList.toggle("active", +b.dataset.id === id));
  $("#franchise-empty").hidden = true;
  $("#franchise").hidden = false;
  $("#season").hidden = true;
  $("#hero-logo").src = logo(id);
  $("#pennant-name").textContent = team.teamName;
  $("#hero-name").textContent = team.name;
  $("#hero-sub").textContent = "Opening the record books…";
  $("#scoreboard").innerHTML = "";
  $("#timeline").innerHTML = "";
  state.archive = (state.photos[id] || {}).archive || [];
  renderHeroPhoto();

  const [hit, pit, hist] = await Promise.all([
    get(`/teams/${id}/stats?stats=yearByYear&group=hitting&sportId=1`),
    get(`/teams/${id}/stats?stats=yearByYear&group=pitching&sportId=1`),
    get(`/teams/${id}/history`),
  ]);
  if (state.team?.id !== id) return; // switched teams mid-load

  const hitBy = new Map(hit.stats[0].splits.map((s) => [+s.season, s.stat]));
  state.eras = hist.teams
    .map((t) => ({ season: +t.season, name: t.name, nick: t.teamName || t.clubName || team.teamName, city: t.franchiseName || t.locationName || "" }))
    .sort((a, b) => a.season - b.season);
  state.seasons = pit.stats[0].splits
    .map((s) => {
      const y = +s.season, st = s.stat, hs = hitBy.get(y) || {}, champ = state.champions[y];
      return {
        year: y, w: st.wins, l: st.losses, pct: pct(st.wins, st.losses), era: st.era, hr: hs.homeRuns, avg: hs.avg,
        name: eraAt(y).name, champ: champ?.winner.id === id, pennant: champ?.loser.id === id,
      };
    })
    .filter((s) => s.w + s.l > 0)
    .sort((a, b) => a.year - b.year);

  state.parks = clipParks((state.history[id] || {}).ballparks || []);

  renderHero();
  renderTimeline();
  renderLegends();
  renderHof();
  renderTrophies();
  renderArchive();
  renderContents();
  if (season && state.seasons.some((s) => s.year === season)) selectSeason(season);
  else updateHash();
}

function eraAt(y) {
  let e = state.eras[0] || { name: state.team.name, nick: state.team.teamName, city: state.team.franchiseName };
  for (const x of state.eras) if (x.season <= y) e = x;
  return e;
}
const seasonsIn = (a, b) => state.seasons.filter((s) => s.year >= a && s.year <= b);
const record = (list) => { const W = list.reduce((a, s) => a + s.w, 0), L = list.reduce((a, s) => a + s.l, 0); return { W, L, p: pct(W, L) }; };

function clipParks(parks) {
  if (!state.seasons.length) return [];
  const first = state.seasons[0].year, last = state.seasons.at(-1).year;
  return parks
    .map((p) => ({ ...p, from: Math.max(p.from, first), to: Math.min(p.to, last) }))
    .filter((p) => p.from <= p.to && seasonsIn(p.from, p.to).length);
}

// ---------- title page + scoreboard ----------
function renderHero() {
  const S = state.seasons, t = state.team;
  const { W, L, p } = record(S);
  const champs = S.filter((s) => s.champ), pennants = S.filter((s) => s.champ || s.pennant);
  const full = S.filter((s) => s.w + s.l >= 100);
  const best = [...full].sort((a, b) => b.pct - a.pct)[0], worst = [...full].sort((a, b) => a.pct - b.pct)[0];
  const lastTitle = champs.at(-1)?.year, thisYear = S.at(-1).year;
  const formerly = [...new Set(state.eras.map((e) => e.name))].filter((n) => n !== t.name);
  const hof = (state.history[t.id] || {}).hof || [];
  $("#hero-sub").textContent = `Est. ${S[0].year} · ${S.length} seasons of baseball` + (formerly.length ? ` · formerly the ${listify(formerly)}` : "");
  const cell = (label, val, sub = "", year = null) =>
    `<div class="sb-cell"${year ? ` data-year="${year}" title="Open ${year}"` : ""}><div class="sb-label">${label}</div><div class="sb-val${String(val).length > 9 ? " sb-long" : ""}">${val}</div><div class="sb-sub">${sub}</div></div>`;
  $("#scoreboard").innerHTML = [
    cell("All-Time", `${num(W)}–${num(L)}`, fmtPct(p)),
    cell("World Titles", champs.length, champs.length ? "last " + lastTitle : "none yet", lastTitle),
    cell("Pennants", pennants.length, "since 1903"),
    best ? cell("Best Season", `${best.w}–${best.l}`, best.year, best.year) : "",
    worst ? cell("Worst Season", `${worst.w}–${worst.l}`, worst.year, worst.year) : "",
    cell("Title Drought", lastTitle ? thisYear - lastTitle : S.length, lastTitle ? "years" : "seasons & counting"),
    cell("Hall of Famers", hof.length, "in Cooperstown"),
  ].join("");
  $$("#scoreboard [data-year]").forEach((el) => (el.onclick = () => selectSeason(+el.dataset.year, { scroll: true })));
}

function heroPick() {
  const land = state.archive.filter((a) => a.w && a.h && a.w / a.h >= 1.2);
  return land.find((a) => a.year && a.year <= 1960) || land[0] || state.archive[0] || null;
}
function renderHeroPhoto() {
  const fig = $("#hero-photo"), a = heroPick();
  fig.hidden = !a;
  $(".title-page").classList.toggle("no-photo", !a);
  if (!a) return;
  $("img", fig).src = a.src;
  $("img", fig).alt = a.title;
  $("figcaption", fig).textContent = `${a.year ? a.year + " — " : ""}${a.title}`;
  fig.onclick = () => openLightbox(a);
}

function renderContents() {
  const links = [
    ["sec-ledger", "The Ledger"], ["sec-legends", "Legends"], ["sec-hof", "Cooperstown"],
    ["sec-trophies", "Trophy Case"], ["sec-scrapbook", "Scrapbook"],
  ].filter(([id]) => !$("#" + id).hidden);
  $("#contents").innerHTML = links.map(([id, label]) => `<a href="#${id}" data-target="${id}">${label}</a>`).join("");
  $$("#contents a").forEach((a) => (a.onclick = (e) => { e.preventDefault(); $("#" + a.dataset.target).scrollIntoView({ behavior: "smooth" }); }));
}

// ---------- the ledger (SVG timeline) ----------
function renderTimeline() {
  const svg = $("#timeline"), S = state.seasons;
  if (!S.length) return;
  const W = Math.max(300, Math.round(svg.clientWidth || 1000)), H = Math.round(svg.clientHeight || 330);
  const top = 20, bandH = 22, axisH = 18, bandsTop = H - bandH * 2 - 2;
  const plotH = bandsTop - top - axisH, mid = top + plotH / 2;
  const n = S.length, bw = W / n, gap = Math.min(1.5, bw * 0.18);
  const maxDev = Math.max(0.2, ...S.map((s) => Math.abs(s.pct - 0.5)));
  const y = (p) => mid - ((p - 0.5) / maxDev) * (plotH / 2);
  const labelEvery = W / (n / 10) < 44 ? 20 : 10;
  const photoYears = new Set(state.archive.map((a) => a.year));
  const idx = (yr) => S.findIndex((s) => s.year >= yr);
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  state.barW = bw;

  let out = `<rect class="span-hl" id="span-hl" x="-100" y="0" width="0" height="${bandsTop}"/>`;
  out += `<rect class="sel" id="sel-rect" x="-100" y="${top - 14}" width="${bw}" height="${plotH + 26}"/>`;
  out += `<line x1="0" x2="${W}" y1="${mid}" y2="${mid}" stroke="#8a7a60" stroke-width="1" stroke-dasharray="3 3"/>`;
  out += `<text x="4" y="${top - 6}">${fmtPct(0.5 + maxDev)}</text><text x="4" y="${top + plotH - 3}">${fmtPct(0.5 - maxDev)}</text>`;
  S.forEach((s, i) => {
    const x = i * bw + gap / 2, w = Math.max(0.6, bw - gap);
    const y0 = Math.min(mid, y(s.pct)), hgt = Math.max(1, Math.abs(y(s.pct) - mid));
    const fill = s.champ ? "var(--gold)" : s.pennant ? "var(--gold-light)" : s.pct >= 0.5 ? "var(--team)" : "var(--down)";
    const stroke = s.pennant ? ` stroke="var(--gold)" stroke-width="1"` : "";
    out += `<rect x="${x}" y="${y0}" width="${w}" height="${hgt}" fill="${fill}"${stroke}/>`;
    if (s.champ) out += `<text x="${x + w / 2}" y="${y0 - 3}" text-anchor="middle" style="fill:var(--gold);font-size:${Math.max(9, Math.min(14, bw * 1.7))}px">★</text>`;
    if (photoYears.has(s.year)) out += `<circle class="photo-dot" cx="${x + w / 2}" cy="${top + plotH + 5}" r="${Math.max(1.8, Math.min(3, bw / 2.4))}"/>`;
    if (s.year % labelEvery === 0) out += `<text x="${x + w / 2}" y="${bandsTop - 4}" text-anchor="middle">${s.year}</text>`;
  });
  // bands: club name, then home ballpark
  const band = (rows, yTop, cls, shade) => rows.forEach((b, k) => {
    const i0 = idx(b.from), i1raw = S.findIndex((s) => s.year > b.to), i1 = i1raw < 0 ? n : i1raw;
    if (i0 < 0 || i1 <= i0) return;
    const x = i0 * bw, w = (i1 - i0) * bw;
    out += `<rect x="${x + 1}" y="${yTop}" width="${Math.max(1, w - 2)}" height="${bandH - 4}" fill="${shade[k % 2]}" stroke="#b9a47c" stroke-width=".6"/>`;
    const words = b.label.split(" ");
    const label = w > b.label.length * 6.4 ? b.label : w > words.at(-1).length * 7 + 8 ? words.at(-1) : "";
    if (label) out += `<text class="band-label ${cls}" x="${x + w / 2}" y="${yTop + bandH / 2 + 2}" text-anchor="middle">${esc(label)}</text>`;
  });
  const names = [];
  S.forEach((s) => { const last = names.at(-1); if (last && last.label === s.name) last.to = s.year; else names.push({ label: s.name, from: s.year, to: s.year }); });
  band(names, bandsTop, "", ["#efe2c2", "#e4d3ab"]);
  band(state.parks.map((p) => ({ label: p.name, from: p.from, to: p.to })), bandsTop + bandH, "park", ["#f6edd6", "#ebdfc1"]);
  S.forEach((s, i) => (out += `<rect class="hit" data-i="${i}" x="${i * bw}" y="0" width="${bw}" height="${bandsTop}"/>`));
  svg.innerHTML = out;
  if (state.pinned) showSpan(state.pinned.from, state.pinned.to);

  const tip = $("#tooltip"), wrap = $(".timeline-wrap");
  svg.onpointermove = (e) => {
    const i = e.target.dataset?.i;
    if (i == null) { tip.hidden = true; return; }
    const s = S[+i], r = wrap.getBoundingClientRect();
    const greats = legendsIn(s.year).map((p) => lastName(p.name));
    const park = state.parks.find((p) => p.from <= s.year && s.year <= p.to);
    tip.innerHTML = `<b>${s.year}</b> ${esc(s.name)}<br>${s.w}–${s.l} (${fmtPct(s.pct)})${s.champ ? " · ★ World Champions" : s.pennant ? " · Pennant" : ""}` +
      (park ? `<br><span class="muted">at ${esc(park.name)}</span>` : "") +
      (greats.length ? `<br><span class="muted">Legends: ${esc(greats.join(", "))}</span>` : "") +
      (photoYears.has(s.year) ? `<br><span class="muted">A photograph survives in the scrapbook</span>` : "");
    tip.style.left = Math.min(r.width - 110, Math.max(110, e.clientX - r.left)) + "px";
    tip.style.top = e.clientY - r.top + "px";
    tip.hidden = false;
  };
  svg.onpointerleave = () => (tip.hidden = true);
  svg.onclick = (e) => { const i = e.target.dataset?.i; if (i != null) selectSeason(S[+i].year, { scroll: true }); };
}

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (state.seasons.length && !$("#view-franchise").hidden) { renderTimeline(); markSelected(); } }, 150);
});

function markSelected() {
  const i = state.seasons.findIndex((s) => s.year === state.selected), r = $("#sel-rect");
  if (r) r.setAttribute("x", i >= 0 ? i * state.barW : -100);
}
function showSpan(from, to) {
  const r = $("#span-hl"), S = state.seasons;
  if (!r) return;
  if (from == null) { r.setAttribute("x", -100); r.setAttribute("width", 0); return; }
  const i0 = S.findIndex((s) => s.year >= from);
  let i1 = S.findIndex((s) => s.year > to);
  if (i1 < 0) i1 = S.length;
  if (i0 < 0) return;
  r.setAttribute("x", i0 * state.barW);
  r.setAttribute("width", Math.max(state.barW, (i1 - i0) * state.barW));
}
function pin(from, to) {
  state.pinned = from == null ? null : { from, to };
  showSpan(from, to);
}

// =====================================================================
// THE NEWSPAPER (season detail)
// =====================================================================
let seasonToken = 0;
async function selectSeason(year, { scroll = false } = {}) {
  const s = state.seasons.find((x) => x.year === year);
  if (!s) return;
  state.selected = year;
  markSelected();
  updateHash();
  const token = ++seasonToken;
  const el = $("#season");
  el.hidden = false;
  const i = state.seasons.indexOf(s), prev = state.seasons[i - 1], next = state.seasons[i + 1];
  const era = eraAt(year), id = state.team.id;
  const photo = state.archive.find((a) => a.year === year);
  const greats = legendsIn(year);
  const park = state.parks.find((p) => p.from <= year && year <= p.to);
  const awards = ((state.history[id] || {}).awards || []).filter((a) => a.season === year);
  const ws = state.champions[year];
  const hl = headline(s, era);
  const price = year < 1918 ? "One Cent" : year < 1950 ? "Three Cents" : year < 1975 ? "Ten Cents" : year < 2000 ? "Fifty Cents" : "Two Dollars";

  let lead = `The ${esc(s.name)} closed the ${year} campaign at ${s.w}–${s.l}, a ${fmtPct(s.pct)} clip<span id="np-finish"></span>.`;
  if (park) lead += ` Home games were played at ${esc(parkWithArticle(park.name))}.`;
  if (greats.length) lead += ` On the roster: future franchise ${greats.length > 1 ? "legends" : "legend"} ${esc(listify(greats.map((p) => p.name)))}.`;
  for (const a of awards) lead += ` ${esc(a.name)} was named ${a.award === "MVP" ? "the league's Most Valuable Player" : a.award === "Cy Young" ? "winner of the Cy Young Award" : "Rookie of the Year"}.`;
  lead += " " + rankLine(s);

  const elsewhere = ws && !s.champ && !s.pennant
    ? `The ${esc(ws.winner.name)} won the World Series over the ${esc(ws.loser.name)}, ${ws.result.split("-").slice(0, 2).join("–")}.`
    : !ws && year >= 1903 ? (year === 1904 ? "No World Series was played this year." : year === 1994 ? "A players' strike cancelled the World Series." : "") : "";

  el.innerHTML = `
    <div class="np-top">
      <span>Vol. ${i + 1} · ${esc(era.city || "")} Edition</span>
      <span class="np-nav">
        <button class="btn btn-small" id="prev" ${prev ? "" : "disabled"}>← ${prev?.year ?? ""}</button>
        <button class="btn btn-small" id="next" ${next ? "" : "disabled"}>${next?.year ?? ""} →</button>
        <button class="btn btn-small" id="close-season" aria-label="Close newspaper">✕</button>
      </span>
    </div>
    <h3 class="np-name">The Dugout Gazette</h3>
    <div class="np-bar"><span>${esc(era.city || "")}, October ${year}</span><span class="hide-sm">Late City Final</span><span>${price}</span></div>
    <h4 class="np-headline" id="np-headline">${esc(hl.head)}</h4>
    <p class="np-deck" id="np-deck">${esc(hl.deck)}</p>
    ${s.champ ? `<div class="np-badge"><span class="badge badge-champ">★ World Champions ★</span></div>` : s.pennant ? `<div class="np-badge"><span class="badge badge-pennant">Pennant Winners</span></div>` : ""}
    <div class="np-cols">
      <div class="np-col">
        ${photo ? `<figure class="np-photo" id="np-photo"><img src="${esc(photo.src)}" alt="${esc(photo.title)}"><figcaption>${esc(photo.title)}. (Archive photograph)</figcaption></figure>` : ""}
        <p class="np-lead">${lead}</p>
      </div>
      <div class="np-col">
        <h5>Stars of the Season</h5>
        <div id="np-stars"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>
        <div id="np-hof"></div>
      </div>
      <div class="np-col">
        <h5>October Report</h5>
        <div id="np-post"><div class="skeleton"></div></div>
        ${elsewhere ? `<h5>Around the League</h5><p class="np-note">${elsewhere}</p>` : ""}
      </div>
    </div>`;
  $("#prev").onclick = () => prev && selectSeason(prev.year);
  $("#next").onclick = () => next && selectSeason(next.year);
  $("#close-season").onclick = () => { el.hidden = true; state.selected = null; markSelected(); updateHash(); };
  if (photo) $("#np-photo").onclick = () => openLightbox(photo);
  if (scroll) el.scrollIntoView({ behavior: "smooth", block: "start" });

  loadFinish(year, id).then((txt) => { if (token === seasonToken && txt) $("#np-finish").textContent = `, good for ${txt}`; });
  loadPostseason(year, id).then((post) => {
    if (token !== seasonToken) return;
    $("#np-post").innerHTML = post.html;
    if (post.series.length && !s.champ && !s.pennant) {
      const last = post.series.at(-1);
      $("#np-headline").textContent = `${era.nick.toUpperCase()} FALL IN ${shortSeries(last.desc).toUpperCase()}`;
      $("#np-deck").textContent = `${s.w}–${s.l} club reaches the postseason, but the ${last.opp} end the dream, ${last.l} games to ${last.w}`;
    }
  });
  loadRoster(year, id).then(({ hitters, pitchers, ids }) => {
    if (token !== seasonToken) return;
    const rows = [...hitters.slice(0, 3).map(boxHitter), ...pitchers.slice(0, 2).map(boxPitcher)];
    $("#np-stars").innerHTML = rows.length ? `<table class="box"><tbody>${rows.join("")}</tbody></table>` : `<p class="np-note">The box scores from this season are lost to time.</p>`;
    const hof = ((state.history[id] || {}).hof || []).filter((x) => ids.has(x.id));
    if (hof.length) $("#np-hof").innerHTML = `<h5>Cooperstown-Bound</h5><div class="np-chips">${hof.map((x) => `<span class="np-chip">${esc(x.name)}</span>`).join("")}</div>`;
  }).catch(() => { if (token === seasonToken) $("#np-stars").innerHTML = `<p class="np-note">The box scores could not be fetched.</p>`; });
}

const shortSeries = (d) => d.replace(/^(AL|NL) /, "").replace("Championship Series", "LCS").replace(/Wild Card (Series|Game)/, "Wild Card");

function headline(s, era) {
  const N = era.nick.toUpperCase(), ws = state.champions[s.year];
  const full = state.seasons.filter((x) => x.w + x.l >= 100 || x === s);
  const rank = [...full].sort((a, b) => b.pct - a.pct).indexOf(s) + 1;
  if (s.champ) {
    const [w, l] = ws.result.split("-");
    return { head: `${N} WIN THE WORLD SERIES!`, deck: `Champions defeat the ${ws.loser.name} ${w} games to ${l}; ${era.city} celebrates` };
  }
  if (s.pennant) {
    const [w, l] = ws.result.split("-");
    return { head: `${N} CAPTURE THE PENNANT`, deck: `But fall to the ${ws.winner.name} in the World Series, ${w} games to ${l}` };
  }
  if (rank === 1) return { head: `GREATEST ${N} TEAM EVER`, deck: `${s.w} victories set the club's all-time high-water mark` };
  if (rank === full.length) return { head: `${N} SINK TO ALL-TIME LOW`, deck: `${s.l} defeats make it the worst campaign in club annals` };
  if (s.pct >= 0.58) return { head: `${N} ROLL TO ${s.w} VICTORIES`, deck: `A banner year for the ${s.name}, though the flag flies elsewhere` };
  if (s.pct >= 0.5) return { head: `${N} FINISH ${s.w}–${s.l}`, deck: `A winning campaign closes for the ${s.name}` };
  if (s.pct < 0.4) return { head: `${N} ENDURE ${s.l} DEFEATS`, deck: `A long summer for the faithful; wait till next year` };
  return { head: `${N} STUMBLE TO ${s.w}–${s.l} FINISH`, deck: `Losing campaign leaves the cranks grumbling` };
}

// "the Polo Grounds", "the Astrodome", but "Fenway Park"
const parkWithArticle = (n) => (/^the /i.test(n) || !/(grounds|dome|coliseum|ballpark at)/i.test(n) ? n : "the " + n);

function rankLine(s) {
  const full = state.seasons.filter((x) => x.w + x.l >= 100 || x === s);
  const rank = [...full].sort((a, b) => b.pct - a.pct).indexOf(s) + 1;
  if (rank === 1) return "No club in franchise history has won at a better clip.";
  if (rank === full.length) return "No club in franchise history has fared worse.";
  return `By winning percentage it ranks ${ordinal(rank)} of ${full.length} seasons in franchise history.`;
}

async function loadFinish(year, teamId) {
  try {
    const d = await get(`/standings?leagueId=103,104&season=${year}&standingsTypes=regularSeason`);
    for (const rec of d.records) {
      const tr = rec.teamRecords.find((t) => t.team.id === teamId);
      if (!tr) continue;
      if (rec.division?.id && tr.divisionRank) return `${ordinal(tr.divisionRank)} place in the ${DIVISIONS[rec.division.id] || "division"}`;
      if (tr.leagueRank) return `${ordinal(tr.leagueRank)} place in the ${LEAGUES[rec.league?.id] || "league"}`;
    }
  } catch {}
  return "";
}

async function loadPostseason(year, teamId) {
  try {
    const d = await get(`/schedule/postseason/series?sportId=1&season=${year}`);
    const series = [];
    for (const s of d.series || []) {
      const games = (s.games || []).filter((g) => g.status?.abstractGameState === "Final" || g.status?.detailedState?.startsWith("Final"));
      if (!games.length) continue;
      const g = games.at(-1);
      const side = g.teams.home.team.id === teamId ? "home" : g.teams.away.team.id === teamId ? "away" : null;
      if (!side) continue;
      const opp = g.teams[side === "home" ? "away" : "home"], me = g.teams[side], rec = me.leagueRecord || {};
      series.push({ date: games[0].gameDate, desc: g.seriesDescription || "Postseason", opp: opp.team.name,
        won: (rec.wins || 0) > (opp.leagueRecord?.wins || 0), w: rec.wins ?? 0, l: rec.losses ?? 0 });
    }
    series.sort((a, b) => a.date.localeCompare(b.date));
    if (!series.length) return { series, html: `<p class="np-note">${year < 1903 ? "There was no modern World Series yet." : "The club watched October from the grandstand."}</p>` };
    return { series, html: `<ul class="np-list">${series.map((m) =>
      `<li><span>${esc(m.desc)} vs. ${esc(m.opp)}</span><span class="${m.won ? "won" : "lost"}">${m.won ? "Won" : "Lost"} ${m.w}–${m.l}</span></li>`).join("")}</ul>` };
  } catch {
    return { series: [], html: `<p class="np-note">The wire reports could not be fetched.</p>` };
  }
}

async function loadRoster(year, teamId) {
  const d = await get(`/teams/${teamId}/roster?season=${year}&rosterType=fullSeason&hydrate=person(stats(group=[hitting,pitching],type=season,season=${year}))`);
  const hitters = [], pitchers = [], ids = new Set();
  for (const r of d.roster || []) {
    const p = r.person;
    ids.add(p.id);
    for (const st of p.stats || []) {
      const splits = st.splits || [];
      const sp = splits.find((x) => x.team?.id === teamId) || (splits.length === 1 ? splits[0] : null);
      if (!sp) continue;
      const base = { id: p.id, name: p.fullName, pos: p.primaryPosition?.abbreviation, stat: sp.stat };
      if (st.group.displayName === "hitting" && p.primaryPosition?.code !== "1") hitters.push(base);
      if (st.group.displayName === "pitching") pitchers.push(base);
    }
  }
  const ip = (s) => { const [a, b = 0] = String(s.inningsPitched || "0").split("."); return +a + +b / 3; };
  const minPA = Math.max(...hitters.map((x) => x.stat.plateAppearances || 0), 1) * 0.55;
  const topH = hitters.filter((x) => (x.stat.plateAppearances || 0) >= minPA)
    .sort((a, b) => parseFloat(b.stat.ops || 0) - parseFloat(a.stat.ops || 0)).slice(0, 4);
  const maxIP = Math.max(...pitchers.map((x) => ip(x.stat)), 1);
  const topP = pitchers.filter((x) => ip(x.stat) >= maxIP * 0.45)
    .sort((a, b) => (parseFloat(a.stat.era) || 99) - (parseFloat(b.stat.era) || 99)).slice(0, 3);
  const closer = pitchers.filter((x) => (x.stat.saves || 0) >= 20).sort((a, b) => b.stat.saves - a.stat.saves)[0];
  if (closer && !topP.some((x) => x.id === closer.id)) topP.splice(1, 0, closer);
  return { hitters: topH, pitchers: topP, ids };
}

const boxHitter = (p) => `<tr><td><span class="pname">${esc(p.name)} <span class="pos">${esc(p.pos || "")}</span></span>
  ${p.stat.avg} avg, ${p.stat.homeRuns} hr, ${p.stat.rbi} rbi${p.stat.stolenBases >= 20 ? `, ${p.stat.stolenBases} sb` : ""}</td></tr>`;
const boxPitcher = (p) => `<tr><td><span class="pname">${esc(p.name)} <span class="pos">P</span></span>
  ${(p.stat.saves || 0) >= 20 ? `${p.stat.saves} saves` : `${p.stat.wins}–${p.stat.losses}`}, ${p.stat.era} era, ${p.stat.strikeOuts} k</td></tr>`;

// =====================================================================
// LEGENDS (tobacco cards)
// =====================================================================
const SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv)$/i;
function lastName(name) { const parts = name.split(" ").filter((w) => !SUFFIX.test(w)); return parts.length > 1 ? parts.slice(1).join(" ") : name; }
const topLegends = () => (state.legends[state.team?.id] || []).slice(0, 5);
const legendsIn = (year) => topLegends().filter((p) => p.from <= year && year <= p.to);

function legendLine(p) {
  const L = p.line || {};
  if (p.kind === "pitcher") {
    return (L.saves || 0) >= 100 ? `${num(L.saves)} saves · ${L.era} ERA · ${num(L.strikeOuts)} K` : `${L.wins}–${L.losses} · ${L.era} ERA · ${num(L.strikeOuts)} K`;
  }
  let t = `${num(L.homeRuns)} HR · ${L.avg} AVG · ${num(L.hits)} hits`;
  if ((L.stolenBases || 0) >= 300) t += ` · ${num(L.stolenBases)} SB`;
  if (p.line2) t += `; on the mound ${p.line2.wins} W, ${p.line2.era} ERA`;
  return t;
}

function bestSeasonIn(from, to) {
  const run = seasonsIn(from, to).filter((s) => s.w + s.l >= 100);
  return run.sort((a, b) => (b.champ - a.champ) || (b.pennant - a.pennant) || b.pct - a.pct)[0];
}

function renderLegends() {
  const L = topLegends(), ph = (state.photos[state.team.id] || {}).legends || {};
  $("#sec-legends").hidden = !L.length;
  $("#legends").innerHTML = L.map((p, i) => {
    const photo = ph[p.id];
    return `<article class="tcard" data-i="${i}" tabindex="0" aria-label="${esc(p.name)}">
      <div class="tcard-face" style="--tc:${COLORS[state.team.id]}">
        <div class="tcard-art${photo ? "" : " headshot"}">
          <img src="${esc(photo ? photo.src : headshot(p.id, 360))}" alt="" loading="lazy">
          <span class="tcard-rank">${i + 1}</span>
        </div>
        <div class="tcard-plate">${esc(p.name)}<small>${esc(p.pos || "")} · ${p.from}–${p.to}</small></div>
      </div>
      <div class="tcard-back">
        <h4>${esc(p.name)}</h4>
        ${p.nick ? `<div class="tcard-nick">“${esc(p.nick)}”</div>` : ""}
        <div class="tcard-meta">${plural(p.seasons, "season")} with the club</div>
        <div class="tcard-line">${legendLine(p)}</div>
        <div class="tcard-val" title="Estimated wins above replacement with this franchise"><b>${Math.round(p.value)}</b>legend value</div>
        ${photo ? `<a class="credit" href="${esc(photo.file)}" target="_blank" rel="noopener">Photo: Wikimedia Commons</a>` : ""}
      </div>
    </article>`;
  }).join("");
  $$("#legends .tcard").forEach((el) => {
    const p = L[+el.dataset.i];
    el.onmouseenter = el.onfocus = () => showSpan(p.from, p.to);
    el.onmouseleave = el.onblur = () => (state.pinned ? showSpan(state.pinned.from, state.pinned.to) : showSpan());
    el.onclick = (e) => {
      if (e.target.closest("a")) return;
      $$(".tcard").forEach((x) => x.classList.toggle("pinned", x === el));
      pin(p.from, p.to);
      const best = bestSeasonIn(p.from, p.to);
      if (best) selectSeason(best.year, { scroll: true });
    };
    el.onkeydown = (e) => { if (e.key === "Enter") el.onclick(e); };
  });
}

// =====================================================================
// HALL OF FAME
// =====================================================================
const HOF_PAGE = 12;
let hofAll = false;
function renderHof() {
  const list = (state.history[state.team.id] || {}).hof || [];
  const legendPhotos = (state.photos[state.team.id] || {}).legends || {};
  $("#sec-hof").hidden = !list.length;
  if (!list.length) return;
  $("#hof-lede").textContent = `${plural(list.length, "member")} of the Hall of Fame wear this club's cap on their plaque. Click a plaque to read the paper from the club's best season of their tenure.`;
  const shown = hofAll ? list : list.slice(0, HOF_PAGE);
  $("#hof").innerHTML = shown.map((x) => `
    <button class="plaque" data-id="${x.id}">
      <img src="${esc(legendPhotos[x.id]?.src || headshot(x.id, 180))}" alt="" loading="lazy">
      <h4>${esc(x.name)}</h4>
      <div>Inducted ${x.inducted}${x.pos && x.pos !== "X" ? " · " + esc(x.pos) : ""}</div>
    </button>`).join("");
  const more = $("#hof-more");
  more.hidden = list.length <= HOF_PAGE;
  more.textContent = hofAll ? "Show fewer" : `Show all ${list.length} plaques`;
  more.onclick = () => { hofAll = !hofAll; renderHof(); };
  $$("#hof .plaque").forEach((b) => (b.onclick = () => openTenure(+b.dataset.id)));
}

async function openTenure(pid) {
  const tid = state.team.id;
  try {
    const d = await get(`/people/${pid}/stats?stats=yearByYear&group=hitting,pitching`);
    const years = new Set();
    for (const st of d.stats || []) for (const sp of st.splits || []) if (sp.team?.id === tid) years.add(+sp.season);
    if (!years.size) return;
    const from = Math.min(...years), to = Math.max(...years);
    pin(from, to);
    const best = bestSeasonIn(from, to) || state.seasons.find((s) => years.has(s.year));
    if (best) selectSeason(best.year, { scroll: true });
  } catch {}
}

// =====================================================================
// TROPHY CASE
// =====================================================================
const TROPHY = (fill) => `<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="${fill}" stroke="#2a2118" stroke-width="1.2" d="M9 4h14v6a7 7 0 0 1-14 0zM9 6H4v3a5 5 0 0 0 5 5M23 6h5v3a5 5 0 0 1-5 5M14 17h4v5h-4zM10 22h12v3H10zM8 25h16v3H8z"/></svg>`;
function renderTrophies() {
  const A = (state.history[state.team.id] || {}).awards || [];
  const groups = [["MVP", "Most Valuable Player", "#d4a830"], ["Cy Young", "Cy Young Award", "#c9c9c9"], ["Rookie of the Year", "Rookie of the Year", "#c27a3a"]];
  $("#sec-trophies").hidden = !A.length;
  $("#trophies").innerHTML = groups.map(([key, label, color]) => {
    const list = A.filter((a) => a.award === key);
    return `<div class="trophy-col"><h4>${TROPHY(color)}${label}<small>${list.length}</small></h4>
      ${list.length ? `<ul class="trophy-list">${list.map((a) => `<li><button data-year="${a.season}">${a.season}</button><span>${esc(a.name)}</span></li>`).join("")}</ul>`
        : `<p class="trophy-empty">The shelf awaits its first.</p>`}</div>`;
  }).join("");
  $$("#trophies [data-year]").forEach((b) => (b.onclick = () => selectSeason(+b.dataset.year, { scroll: true })));
}

// =====================================================================
// SCRAPBOOK + LIGHTBOX
// =====================================================================
function renderArchive() {
  const A = state.archive;
  $("#sec-scrapbook").hidden = !A.length;
  $("#archive").innerHTML = A.map((a, i) => `
    <button class="snap" data-i="${i}" style="--rot:${(((i * 37) % 7) - 3) * 0.55}deg">
      <img src="${esc(a.src)}" alt="${esc(a.title)}" loading="lazy">
      <span class="snap-cap">${a.year ? `<b>${a.year}</b>` : ""}${esc(a.title)}</span>
    </button>`).join("");
  $$("#archive .snap").forEach((b) => (b.onclick = () => openLightbox(A[+b.dataset.i])));
}

const lb = $("#lightbox");
lb.addEventListener("click", (e) => { if (e.target === lb) lb.close(); });
$("#lb-close").onclick = () => lb.close();
function openLightbox(a) {
  if (!a) return;
  $("#lb-img").src = a.src;
  $("#lb-img").alt = a.title;
  $("#lb-title").textContent = (a.year ? a.year + " — " : "") + a.title;
  $("#lb-cap").textContent = a.caption || "";
  $("#lb-wiki").href = a.url || "#";
  $("#lb-wiki").hidden = !a.url;
  $("#lb-file").href = a.file;
  const btn = $("#lb-season"), has = a.year && state.seasons.some((s) => s.year === a.year);
  btn.hidden = !has;
  if (has) {
    btn.textContent = `Read the ${a.year} paper →`;
    btn.onclick = () => { lb.close(); selectSeason(a.year, { scroll: true }); };
  }
  lb.showModal();
}

$("#btn-random").onclick = () => {
  const S = state.seasons;
  let pick;
  do pick = S[Math.floor(Math.random() * S.length)].year; while (S.length > 1 && pick === state.selected);
  selectSeason(pick, { scroll: true });
};

// =====================================================================
// LEAGUE
// =====================================================================
function renderLeague() {
  const C = state.champions, years = Object.keys(C).map(Number);
  const thisYear = Math.max(...years, new Date().getFullYear() - 1);
  const rows = state.teams.map((t) => {
    const won = years.filter((y) => C[y].winner.id === t.id), last = won.at(-1);
    const start = Math.max(1903, t.firstYearOfPlay ? +t.firstYearOfPlay : 1903);
    return { t, titles: won.length, last, drought: last ? thisYear - last : thisYear - start + 1, never: !last };
  }).sort((a, b) => b.drought - a.drought);
  const max = rows[0].drought;
  $("#droughts").innerHTML = rows.map((r) => `
    <div class="brow" data-id="${r.t.id}">
      <img src="${logo(r.t.id)}" alt="" loading="lazy">
      <div class="bname">${esc(r.t.teamName)} <small>· ${plural(r.titles, "title")}</small></div>
      <div class="bbar-wrap"><div class="bbar" style="width:${(r.drought / max) * 100}%"></div></div>
      <div class="bval"><b>${r.drought}</b>${r.never ? "never" : "since " + r.last}</div>
    </div>`).join("");
  $$("#droughts .brow").forEach((el) => (el.onclick = () => { showView("franchise"); selectTeam(+el.dataset.id); window.scrollTo({ top: 0, behavior: "smooth" }); }));

  const wall = [];
  for (let y = thisYear; y >= 1903; y--) {
    const c = C[y];
    if (!c) { wall.push(`<div class="wpen gap" title="No World Series">${y}<br>no series</div>`); continue; }
    wall.push(`<button class="wpen" style="--pc:${COLORS[c.winner.id] || "#1e3557"}" data-id="${c.winner.id}" data-year="${y}" title="${y}: ${esc(c.winner.name)} def. ${esc(c.loser.name)} (${c.result})">
      <img src="${logo(c.winner.id)}" alt="${esc(c.winner.name)}" loading="lazy"><span>${y}</span></button>`);
  }
  $("#wall").innerHTML = wall.join("");
  $$("#wall .wpen[data-id]").forEach((el) => (el.onclick = async () => {
    showView("franchise");
    await selectTeam(+el.dataset.id, +el.dataset.year);
    $("#season").scrollIntoView({ behavior: "smooth" });
  }));
}

// =====================================================================
// GUESS THE YEAR
// =====================================================================
const ROUNDS = 5;
const game = { round: 0, score: 0, pool: [], current: null, hintUsed: false, history: [] };
const dlg = $("#game");
$("#game-close").onclick = () => dlg.close();
$("#btn-game").onclick = startGame;

function startGame() {
  const S = state.seasons.filter((s) => s.year >= 1903 && s.w + s.l >= 100);
  Object.assign(game, { round: 0, score: 0, pool: [...S].sort(() => Math.random() - 0.5).slice(0, ROUNDS), history: [] });
  dlg.showModal();
  nextRound();
}

async function nextRound() {
  const body = $("#game-body");
  if (game.round >= game.pool.length) return finishGame();
  const s = game.pool[game.round];
  game.current = s; game.hintUsed = false;
  const meta = `<p class="round-meta">Round ${game.round + 1} of ${game.pool.length} · ${esc(state.team.teamName)} · Score ${game.score}</p>`;
  body.innerHTML = `<h3>Guess the Year</h3>${meta}<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>`;
  let star = null;
  try { star = (await loadRoster(s.year, state.team.id)).hitters[0]; } catch {}
  if (game.current !== s) return;
  const S = state.seasons.filter((x) => x.year >= 1903), lo = S[0].year, hi = S.at(-1).year, mid = Math.round((lo + hi) / 2);
  const park = state.parks.find((p) => p.from <= s.year && s.year <= p.to);
  body.innerHTML = `
    <h3>Guess the Year</h3>${meta}
    <div class="clue-list">
      <div class="clue"><span>Record</span><b>${s.w}–${s.l} (${fmtPct(s.pct)})</b></div>
      <div class="clue"><span>Team HR / AVG / ERA</span><b>${s.hr ?? "?"} / ${s.avg ?? "?"} / ${s.era ?? "?"}</b></div>
      ${park && state.parks.length > 1 ? `<div class="clue"><span>Home park</span><b>${esc(park.name)}</b></div>` : ""}
      ${star ? `<div class="clue"><span>Best hitter</span><b id="star">${star.stat.homeRuns} HR, ${star.stat.avg} AVG, ${star.stat.ops} OPS<br><button class="btn btn-small" id="hint" style="margin-top:6px">Reveal name (−25)</button></b></div>` : ""}
      <div class="clue"><span>October</span><b>${s.champ ? "Won the World Series ★" : s.pennant ? "Lost the World Series" : "No pennant"}</b></div>
    </div>
    <div class="year-pick"><output id="yr">${mid}</output><input id="slider" type="range" min="${lo}" max="${hi}" value="${mid}" aria-label="Year guess"></div>
    <div class="game-actions"><button class="btn btn-red" id="lock">Lock it in</button></div>`;
  const slider = $("#slider"), out = $("#yr");
  slider.oninput = () => (out.textContent = slider.value);
  const hint = $("#hint");
  if (hint) hint.onclick = () => { game.hintUsed = true; hint.replaceWith(Object.assign(document.createElement("div"), { textContent: star.name, style: "color:var(--red)" })); };
  $("#lock").onclick = () => reveal(+slider.value, star);
}

function reveal(guess, star) {
  const s = game.current, off = Math.abs(guess - s.year);
  const pts = Math.max(0, 100 - off * 6 - (game.hintUsed ? 25 : 0));
  game.score += pts;
  game.history.push({ year: s.year, guess, pts });
  const verdict = off === 0 ? "Right on the button!" : off <= 3 ? "Close enough to smell the peanuts." : off <= 10 ? "Right era." : off <= 25 ? "Wrong generation." : "Way out in the bleachers.";
  $("#game-body").innerHTML = `
    <h3>Guess the Year</h3>
    <p class="round-meta">Round ${game.round + 1} of ${game.pool.length}</p>
    <div class="result">
      <div class="round-meta">It was the</div>
      <div class="big">${s.year} ${esc(s.name)}</div>
      <p>You guessed <b>${guess}</b>: ${plural(off, "year")} off. ${verdict}</p>
      ${star ? `<p>Best hitter: <b>${esc(star.name)}</b></p>` : ""}
      <span class="score-pill">+${pts}</span>
    </div>
    <div class="game-actions">
      <button class="btn" id="view">Read the ${s.year} paper</button>
      <button class="btn btn-red" id="go">${game.round + 1 < game.pool.length ? "Next round →" : "Final score"}</button>
    </div>`;
  $("#view").onclick = () => { dlg.close(); selectSeason(s.year, { scroll: true }); };
  $("#go").onclick = () => { game.round++; nextRound(); };
}

function finishGame() {
  const max = game.pool.length * 100, sc = game.score;
  const title = sc >= max * 0.85 ? "Hall of Famer" : sc >= max * 0.65 ? "All-Star" : sc >= max * 0.45 ? "Everyday Starter" : sc >= max * 0.25 ? "Bench Bat" : "Sent Down to the Minors";
  const grid = game.history.map((x) => (x.pts >= 90 ? "🟩" : x.pts >= 60 ? "🟨" : x.pts >= 25 ? "🟧" : "⬛")).join("");
  const share = `Dugout Time Machine · ${state.team.teamName}\n${grid} ${sc}/${max}`;
  $("#game-body").innerHTML = `
    <h3>Final Score</h3>
    <div class="result">
      <div class="year-pick"><output>${sc}</output></div>
      <p class="round-meta">out of ${max} · Rating: ${title}</p>
      <p style="font-size:22px;margin:4px 0">${grid}</p>
      <ul class="final-list">${game.history.map((x) => `<li><span>${x.year}</span><span>guessed ${x.guess} · +${x.pts}</span></li>`).join("")}</ul>
    </div>
    <div class="game-actions">
      <button class="btn" id="copy">Copy result</button>
      <button class="btn btn-red" id="again">Play again</button>
    </div>`;
  $("#again").onclick = startGame;
  $("#copy").onclick = async (e) => {
    try { await navigator.clipboard.writeText(share); e.target.textContent = "Copied!"; } catch { e.target.textContent = "Copy failed"; }
  };
}

init().catch((err) => {
  console.error(err);
  $("#franchise-empty").innerHTML = `<p class="empty-big">Rain delay</p><p>Couldn't reach the MLB Stats API. ${esc(err.message)}</p>`;
});
