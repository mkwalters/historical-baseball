// The Grandstand Almanac v3 — a franchise almanac. Vanilla JS + the public MLB Stats API.
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

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const h = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (w, l) => (w + l ? w / (w + l) : 0);
const fmtPct = (p) => p.toFixed(3).replace(/^0/, "");
const num = (n) => (n == null ? "?" : Number(n).toLocaleString());
const plural = (n, word, pl = word + "s") => `${n} ${n === 1 ? word : pl}`;
const listify = (a) => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a.at(-1));
const json = (url) => fetch(url).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const word = (n) => WORDS[n] ?? String(n);
const ORD = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth", "Eleventh", "Twelfth"];
// "1903, 1904, 1905, 1910" -> "1903–05, 1910"
function spans(years) {
  const out = [];
  for (const y of years) {
    const last = out.at(-1);
    if (last && y === last[1] + 1) last[1] = y; else out.push([y, y]);
  }
  return out.map(([a, b]) => (a === b ? `${a}` : `${a}–${String(b).slice(Math.floor(a / 100) === Math.floor(b / 100) ? 2 : 0)}`)).join(", ");
}

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
  teams: [], champions: {}, legends: {}, photos: {}, history: {}, people: {}, retired: {}, modern: {},
  team: null, seasons: [], eras: [], parks: [], archive: [],
  barW: 1, page: "ledger", pages: [], decade: null,
};

async function init() {
  const b = await json("data/bundle/teams.json");
  if (b.teams) Object.assign(BUNDLE, { on: true, teams: { teams: b.teams }, logos: b.logos || {} });
  const [teamsRes, champions, legends, photos, history, people, retired, modern] = await Promise.all([
    get(`/teams?sportId=1&season=${new Date().getFullYear()}`),
    json("data/champions.json"), json("data/legends.json"), json("data/photos.json"), json("data/history.json"),
    json("data/people.json"), json("data/retired.json"), json("data/modern.json"),
  ]);
  Object.assign(state, { champions, legends, photos, history, people, retired, modern });
  state.teams = teamsRes.teams.filter((t) => t.sport?.id === 1).sort((a, b) => a.teamName.localeCompare(b.teamName));
  renderPicker();
  renderLeague();
  $$(".tab").forEach((b) => (b.onclick = () => showView(b.dataset.view)));
  $("#home-link").onclick = (e) => { e.preventDefault(); goHome(); };
  $("#prev").onclick = () => step(-1);
  $("#next").onclick = () => (state.page === state.pages.at(-1) ? goPage(state.pages[0]) : step(1));
  document.addEventListener("keydown", onKey);

  const params = new URLSearchParams(location.hash.slice(1));
  const teamId = +(params.get("team") || 0);
  if (teamId && state.teams.some((t) => t.id === teamId)) await selectTeam(teamId, params.get("page") || "ledger");
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
  Object.assign(state, { team: null, seasons: [] });
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
  document.body.classList.toggle("paging", v === "franchise" && !!state.team);
  if (v === "franchise" && state.page === "ledger" && state.seasons.length) renderTimeline();
  updateHash(v);
}
function updateHash(view = "franchise") {
  const p = new URLSearchParams();
  if (state.team) p.set("team", state.team.id);
  if (view === "league") p.set("view", "league");
  else if (state.team && state.page !== state.pages[0]) p.set("page", state.page);
  try { history.replaceState(null, "", "#" + p.toString()); } catch {}
}

// =====================================================================
// PAGES: one chapter at a time, with a progress strip and a Next button
// =====================================================================
const pageEl = (k) => $(`.page[data-page="${k}"]`);
const pageLabel = (k) => pageEl(k).dataset.label;

function setupPages() {
  state.pages = $$(".page").filter((el) => !el.dataset.skip).map((el) => el.dataset.page);
  let n = 0;
  for (const k of state.pages) {
    const kicker = $(".kicker", pageEl(k));
    if (kicker) kicker.textContent = `Chapter the ${ORD[n++]}`;
  }
  $("#progress").innerHTML = `<div class="progress-track"><div class="progress-fill" id="progress-fill"></div></div>` +
    state.pages.map((k, i) => `<button class="pstop" data-k="${k}" title="${esc(pageLabel(k))}"><i>${i + 1}</i><span>${esc(pageLabel(k))}</span></button>`).join("");
  $$("#progress .pstop").forEach((b) => (b.onclick = () => goPage(b.dataset.k)));
}

function goPage(k, { scroll = true } = {}) {
  if (!state.pages.includes(k)) k = state.pages[0];
  const from = state.pages.indexOf(state.page), to = state.pages.indexOf(k);
  state.page = k;
  for (const el of $$(".page")) {
    const on = el.dataset.page === k;
    el.hidden = !on;
    if (on) {
      el.classList.remove("turn-fwd", "turn-back");
      void el.offsetWidth;
      el.classList.add(to >= from ? "turn-fwd" : "turn-back");
    }
  }
  $$("#progress .pstop").forEach((b, i) => {
    b.classList.toggle("current", i === to);
    b.classList.toggle("done", i < to);
    b.setAttribute("aria-current", i === to ? "step" : "false");
  });
  $("#progress-fill").style.width = `${(to / Math.max(1, state.pages.length - 1)) * 100}%`;
  const prev = state.pages[to - 1], next = state.pages[to + 1];
  $("#prev").hidden = !prev;
  $("#next").hidden = state.pages.length < 2;
  if (prev) $("#prev .pager-label").textContent = pageLabel(prev);
  $("#next .pager-label").textContent = next ? "Next: " + pageLabel(next) : "Back to the start";
  if (k === "ledger") renderTimeline();
  updateHash();
  if (scroll) {
    const top = $("#franchise").getBoundingClientRect().top + window.scrollY - 6;
    if (window.scrollY > top || to > 0) window.scrollTo({ top, behavior: "smooth" });
  }
}
function step(d) {
  const i = state.pages.indexOf(state.page) + d;
  if (i >= 0 && i < state.pages.length) goPage(state.pages[i]);
}
function onKey(e) {
  if (!state.team || $("#view-franchise").hidden || lb.open || e.altKey || e.ctrlKey || e.metaKey) return;
  if (/input|textarea|select/i.test(document.activeElement?.tagName || "")) return;
  if (e.key === "ArrowRight") { step(1); e.preventDefault(); }
  if (e.key === "ArrowLeft") { step(-1); e.preventDefault(); }
}

// =====================================================================
// FRANCHISE
// =====================================================================
async function selectTeam(id, page = "ledger") {
  const team = state.teams.find((t) => t.id === id);
  Object.assign(state, { team, seasons: [], decade: null });
  await ensureBundle(id);
  if (state.team?.id !== id) return;
  document.documentElement.style.setProperty("--team", COLORS[id] || "#1e3557");
  $$(".team-btn").forEach((b) => b.classList.toggle("active", +b.dataset.id === id));
  $("#franchise-empty").hidden = true;
  $("#franchise").hidden = false;
  $$(".page").forEach((el) => (el.hidden = el.dataset.page !== "ledger")); // only the first chapter while loading
  document.body.classList.add("paging");
  $("#hero-sub").textContent = "Opening the record books…";
  $("#scoreboard").innerHTML = "";
  $("#timeline").innerHTML = "";
  state.archive = ((state.photos[id] || {}).archive || []).slice();

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
  renderEras();
  renderOctober();
  renderLegends();
  renderDugout();
  renderNumbers();
  renderHof();
  renderTrophies();
  renderParks();
  renderArchive();
  renderModern();
  setupPages();
  goPage(page, { scroll: false });
}

function eraAt(y) {
  let e = state.eras[0] || { name: state.team.name, nick: state.team.teamName, city: state.team.franchiseName };
  for (const x of state.eras) if (x.season <= y) e = x;
  return e;
}
const seasonsIn = (a, b) => state.seasons.filter((s) => s.year >= a && s.year <= b);
const record = (list) => { const W = list.reduce((a, s) => a + s.w, 0), L = list.reduce((a, s) => a + s.l, 0); return { W, L, p: pct(W, L) }; };
const teamPeople = () => state.people[state.team.id] || { managers: [], people: [] };
const managersIn = (y) => teamPeople().managers.filter((m) => (m.years || []).includes(y));
// The headline awards (MVP, Cy Young, Rookie of the Year) won in a season; Gold Gloves and Silver Sluggers live in the Trophy Case.
const BIG_AWARDS = new Set(["MVP", "Cy Young", "Rookie of the Year"]);
const awardsIn = (y) => ((state.history[state.team.id] || {}).awards || []).filter((a) => a.season === y && BIG_AWARDS.has(a.award));

function clipParks(parks) {
  if (!state.seasons.length) return [];
  const first = state.seasons[0].year, last = state.seasons.at(-1).year;
  return parks
    .map((p) => ({ ...p, key: `${p.name}|${p.from}`, from: Math.max(p.from, first), to: Math.min(p.to, last) }))
    .filter((p) => p.from <= p.to && seasonsIn(p.from, p.to).length);
}
const markSkip = (k, skip) => { if (skip) pageEl(k).dataset.skip = "1"; else delete pageEl(k).dataset.skip; };
// Empty a skipped chapter so nothing from the previous club lingers in it.
const clearPage = (k, ...ids) => ids.forEach((id) => ($("#" + id).innerHTML = ""));

// ---------- scoreboard (top of the ledger) ----------
function renderHero() {
  const S = state.seasons, t = state.team;
  const { W, L, p } = record(S);
  const champs = S.filter((s) => s.champ), pennants = S.filter((s) => s.champ || s.pennant);
  const full = S.filter((s) => s.w + s.l >= 100);
  const best = [...full].sort((a, b) => b.pct - a.pct)[0], worst = [...full].sort((a, b) => a.pct - b.pct)[0];
  const lastTitle = champs.at(-1)?.year, thisYear = S.at(-1).year;
  const formerly = [...new Set(state.eras.map((e) => e.name))].filter((n) => n !== t.name);
  const hof = (state.history[t.id] || {}).hof || [];
  $("#hero-sub").textContent = `${t.name} · Est. ${S[0].year} · ${S.length} seasons of baseball` + (formerly.length ? ` · formerly the ${listify(formerly)}` : "");
  const cell = (label, val, sub = "") =>
    `<div class="sb-cell"><div class="sb-label">${label}</div><div class="sb-val${String(val).length > 9 ? " sb-long" : ""}">${val}</div><div class="sb-sub">${sub}</div></div>`;
  $("#scoreboard").innerHTML = [
    cell("All-Time", `${num(W)}–${num(L)}`, fmtPct(p)),
    cell("World Titles", champs.length, champs.length ? "last " + lastTitle : "none yet"),
    cell("Pennants", pennants.length, "since 1903"),
    best ? cell("Best Season", `${best.w}–${best.l}`, best.year) : "",
    worst ? cell("Worst Season", `${worst.w}–${worst.l}`, worst.year) : "",
    cell("Title Drought", lastTitle ? thisYear - lastTitle : S.length, lastTitle ? "years" : "seasons & counting"),
    cell("Hall of Famers", hof.length, "in Cooperstown"),
  ].join("");
}

// "Polo Grounds" -> "the Polo Grounds", "The Kingdome" -> "the Kingdome"
function parkName(n) {
  if (!n) return n;
  if (/^the /i.test(n)) return "the " + n.slice(4);
  return /(Grounds|dome|Coliseum|Bowl|Ballpark)$|^Palace/.test(n) ? "the " + n : n;
}
// ---------- the ledger (SVG timeline) ----------
function renderTimeline() {
  const svg = $("#timeline"), S = state.seasons;
  if (!S.length || pageEl("ledger").hidden) return;
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

  let out = `<line x1="0" x2="${W}" y1="${mid}" y2="${mid}" stroke="#8a7a60" stroke-width="1" stroke-dasharray="3 3"/>`;
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

  const tip = $("#tooltip"), wrap = $(".timeline-wrap");
  svg.onpointermove = (e) => {
    const i = e.target.dataset?.i;
    if (i == null) { tip.hidden = true; return; }
    const s = S[+i], r = wrap.getBoundingClientRect();
    const greats = allLegendsIn(s.year).map((p) => lastName(p.name));
    const park = state.parks.find((p) => p.from <= s.year && s.year <= p.to);
    const mgr = managersIn(s.year).map((m) => m.name);
    const aw = awardsIn(s.year).map((a) => `${a.award === "Rookie of the Year" ? "ROY" : a.award}: ${a.name}`);
    tip.innerHTML = `<b>${s.year}</b> ${esc(s.name)}<br>${s.w}–${s.l} (${fmtPct(s.pct)})${s.champ ? " · ★ World Champions" : s.pennant ? " · Pennant" : ""}` +
      (mgr.length ? `<br><span class="muted">Skipper: ${esc(listify(mgr))}</span>` : "") +
      (park ? `<br><span class="muted">at ${esc(park.name)}</span>` : "") +
      (greats.length ? `<br><span class="muted">Legends: ${esc(greats.join(", "))}</span>` : "") +
      (aw.length ? `<br><span class="muted">${esc(aw.join(" · "))}</span>` : "") +
      (photoYears.has(s.year) ? `<br><span class="muted">A photograph survives in the scrapbook</span>` : "");
    tip.style.left = Math.min(r.width - 110, Math.max(110, e.clientX - r.left)) + "px";
    tip.style.top = e.clientY - r.top + "px";
    tip.hidden = false;
  };
  svg.onpointerleave = () => (tip.hidden = true);
}

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (state.seasons.length && !$("#view-franchise").hidden) renderTimeline(); }, 150);
});

// Almanac facts under the ledger: golden decade, lean years, longest run of winning seasons.
function renderEras() {
  const S = state.seasons, facts = [];
  const win = (k) => {
    let best = null, worst = null;
    for (let i = 0; i + k <= S.length; i++) {
      const slice = S.slice(i, i + k);
      if (slice.at(-1).year - slice[0].year !== k - 1) continue; // skip windows that span a gap
      const r = { ...record(slice), from: slice[0].year, to: slice.at(-1).year, champs: slice.filter((s) => s.champ).length, flags: slice.filter((s) => s.champ || s.pennant).length };
      if (!best || r.p > best.p) best = r;
      if (!worst || r.p < worst.p) worst = r;
    }
    return { best, worst };
  };
  if (S.length >= 20) {
    const { best, worst } = win(10);
    if (best) facts.push(["The Golden Decade", `${best.from}–${best.to}`, `${num(best.W)}–${num(best.L)}, ${fmtPct(best.p)}` + (best.flags ? ` · ${plural(best.flags, "pennant")}` : "") + (best.champs ? `, ${plural(best.champs, "title")}` : "")]);
    if (worst) facts.push(["The Lean Years", `${worst.from}–${worst.to}`, `${num(worst.W)}–${num(worst.L)}, ${fmtPct(worst.p)}`]);
  }
  let run = 0, bestRun = { n: 0 };
  S.forEach((s, i) => {
    run = s.pct > 0.5 && (i === 0 || S[i - 1].year === s.year - 1) ? run + 1 : s.pct > 0.5 ? 1 : 0;
    if (run > bestRun.n) bestRun = { n: run, to: s.year };
  });
  if (bestRun.n >= 2) facts.push(["Winning Streak", plural(bestRun.n, "season"), `straight winning years, ${bestRun.to - bestRun.n + 1}–${bestRun.to}`]);
  const most = [...S].sort((a, b) => b.w - a.w)[0];
  if (most) facts.push(["Most Wins", `${most.w}`, `in ${most.year} (${most.w}–${most.l})`]);
  const names = [...new Set(state.eras.map((e) => e.name))];
  const older = names.filter((n) => n !== state.team.name);
  if (older.length) facts.push(["Also Known As", plural(older.length, "former name"), listify(older)]);
  $("#eras").innerHTML = facts.map(([k, v, sub]) => `<div class="fact"><div class="fact-k">${k}</div><div class="fact-v">${esc(v)}</div><div class="fact-sub">${esc(sub)}</div></div>`).join("");
}

// =====================================================================
// OCTOBER: every World Series the club played in
// =====================================================================
function renderOctober() {
  // World Series titles only, with the series told game by game.
  const tid = state.team.id;
  const S = state.seasons.filter((s) => s.champ);
  markSkip("october", !S.length);
  if (!S.length) return clearPage("october", "october");
  const pennants = state.seasons.filter((s) => s.pennant && !s.champ).length;
  $("#october-lede").textContent = (S.length === 1 ? `One World Series championship, in ${S[0].year}`
    : `${word(S.length)[0].toUpperCase() + word(S.length).slice(1)} World Series championships, from ${S[0].year} to ${S.at(-1).year}`)
    + (pennants ? `, and ${plural(pennants, "other trip")} to the Fall Classic.` : ".");
  const photoFor = (y) => state.archive.find((a) => a.year === y && /world series/i.test(a.title)) || state.archive.find((a) => a.year === y);
  const ORDN = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"];
  $("#october").innerHTML = S.slice().reverse().map((s) => {
    const c = state.champions[s.year], [a, b, t] = (c.result || "").split("-");
    const games = (c.games || []).map((g, i) => {
      const home = g.home === tid, us = home ? g.hs : g.as, them = home ? g.as : g.hs;
      return { n: i + 1, us, them, home, res: us > them ? "W" : us < them ? "L" : "T", inn: g.inn, park: g.park };
    });
    const last = games.at(-1);
    const sweep = +b === 0 && !t;
    const runs = games.reduce((r, g) => [r[0] + g.us, r[1] + g.them], [0, 0]);
    const mgr = managersIn(s.year).map((m) => m.name);
    const stars = allLegendsIn(s.year).map((p) => p.name);
    const mvp = (c.mvp || []).filter((m) => m.team === tid).map((m) => m.name);
    const ph = photoFor(s.year);
    const chips = games.map((g) => `<span class="oct-g ${g.res.toLowerCase()}" title="Game ${g.n}${g.park ? " at " + esc(g.park) : ""}${g.inn > 9 ? `, ${g.inn} innings` : ""}">`
      + `<small>G${g.n}${g.home ? "" : " @"}</small><b>${g.res}</b> ${g.us}–${g.them}${g.inn > 9 ? `<sup>${g.inn}</sup>` : ""}</span>`).join("");
    const clinch = last ? `Clinched in Game ${last.n}${last.park ? ` at ${esc(last.park)}` : ""}, ${last.us}–${last.them}${last.inn > 9 ? ` in ${last.inn} innings` : ""}.` : "";
    return `<article class="oct won">
      <div class="oct-year"><span>${s.year}</span><i>★</i></div>
      <div class="oct-body">
        <div class="oct-flag">${sweep ? `A ${ORDN[+a] ? ORDN[+a].toLowerCase() + "-game " : ""}sweep` : +a + +b === 7 ? "Won in seven" : "World Champions"}</div>
        <h4>Beat the ${esc(c.loser.name)}, <span class="oct-score">${a}–${b}${t ? `–${t}` : ""}</span></h4>
        ${chips ? `<div class="oct-games">${chips}</div>` : ""}
        <p>${clinch}${!games.length ? "" : runs[0] > runs[1] ? ` Outscored them ${runs[0]}–${runs[1]} over the series.`
          : runs[0] < runs[1] ? ` Won it despite being outscored ${runs[1]}–${runs[0]}.` : ` Runs were even over the series, ${runs[0]}–${runs[1]}.`}</p>
        <p>${esc(s.name)} · ${s.w}–${s.l} in the regular season${mgr.length ? ` · managed by ${esc(listify(mgr))}` : ""}</p>
        ${mvp.length ? `<p class="oct-mvp">World Series MVP: ${esc(listify(mvp))}</p>` : ""}
        ${stars.length ? `<p class="oct-stars">On the roster: ${esc(listify(stars))}</p>` : ""}
      </div>
      ${ph ? `<button class="oct-photo" data-i="${state.archive.indexOf(ph)}"><img src="${esc(ph.src)}" alt="${esc(ph.title)}" loading="lazy"></button>` : ""}
    </article>`;
  }).join("");
  $$("#october .oct-photo").forEach((b) => (b.onclick = () => openLightbox(state.archive, +b.dataset.i)));
}

// =====================================================================
// LEGENDS (tobacco cards)
// =====================================================================
const SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv)$/i;
function lastName(name) { const parts = name.split(" ").filter((w) => !SUFFIX.test(w)); return parts.length > 1 ? parts.slice(1).join(" ") : name; }
const allLegends = () => state.legends[state.team?.id] || [];
const LEGEND_CARDS = 10;
const topLegends = () => allLegends().slice(0, LEGEND_CARDS);
const allLegendsIn = (year) => allLegends().filter((p) => p.from <= year && year <= p.to);
// A legend's portrait: a curated in-uniform Commons photo, else MLB's own (uniformed) headshot.
const legendPhoto = (pid) => { const p = ((state.photos[state.team.id] || {}).legends || {})[pid]; return p && p.src ? p : null; };
// A stand-in portrait for a manager or Hall of Famer whose MLB headshot is the blank silhouette.
const facePhoto = (pid) => ((state.photos[state.team.id] || {}).faces || {})[pid]?.src || null;

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

function renderLegends() {
  const L = topLegends();
  markSkip("legends", !L.length);
  $("#legends").innerHTML = L.map((p, i) => {
    const photo = legendPhoto(p.id);
    return `<article class="tcard" aria-label="${esc(p.name)}">
      <div class="tcard-face" style="--tc:${COLORS[state.team.id]}">
        <div class="tcard-art${photo ? "" : " headshot"}">
          <img src="${esc(photo ? photo.src : headshot(p.id, 360))}" alt="" loading="lazy"${photo?.pos ? ` style="object-position:${esc(photo.pos)}"` : ""}>
          <span class="tcard-rank">${i + 1}</span>
        </div>
        <div class="tcard-plate">${esc(p.name)}<small>${esc(p.pos || "")} · ${p.from}–${p.to}</small></div>
      </div>
      <div class="tcard-back">
        <h4>${esc(p.name)}</h4>
        ${p.nick ? `<div class="tcard-nick">“${esc(p.nick)}”</div>` : ""}
        <div class="tcard-meta">${plural(p.seasons, "season")} with the club</div>
        <div class="tcard-line">${legendLine(p)}</div>
        ${photo ? `<a class="credit" href="${esc(photo.file)}" target="_blank" rel="noopener">Photo: Wikimedia Commons</a>` : ""}
      </div>
    </article>`;
  }).join("");
  const more = allLegends().slice(LEGEND_CARDS);
  $("#also").innerHTML = more.length
    ? `<span class="also-k">Also in the conversation</span> ${more.map((p) => `<span class="also-p">${esc(p.name)} <small>${p.from}–${p.to}</small></span>`).join("")}`
    : "";
}

// =====================================================================
// MODERN STARS (the last twenty seasons, ranked by WAR)
// =====================================================================
const MODERN_CARDS = 10;
const fmtWar = (w) => (w < 0 ? "−" : "") + Math.abs(w).toFixed(1);
const rate = (x) => x.toFixed(3).replace(/^0/, "");
// A modern star's portrait: a hand-checked Commons photo in this club's uniform, else MLB's headshot
// when the club was his last stop (so it shows this uniform), else none (the card shows his initials).
function modernPhoto(p) {
  const c = ((state.photos[state.team.id] || {}).modern || {})[p.id];
  if (c) return c.src ? { src: c.src, file: c.file, pos: c.pos } : null; // {src: null}: the headshot shows another club
  if (p.home) return { src: headshot(p.id, 360), headshot: true };
  return null;
}
function modernPos(p) {
  if (p.pos === "TWP") return "Two-way";
  if (p.kind === "pitcher" && p.line) return p.line.gs >= p.line.g / 2 ? "SP" : "RP";
  return p.pos || "";
}
function modernLine(p) {
  const L = p.line || {};
  if (p.kind === "pitcher") {
    const rec = L.sv >= 100 ? `${num(L.sv)} saves` : `${L.w}–${L.l}`;
    return `${rec} · ${L.era.toFixed(2)} ERA · ${num(L.k)} K`;
  }
  let t = `${num(L.hr)} HR · ${rate(L.avg)} AVG · ${rate(L.ops)} OPS`;
  if (L.sb >= 150) t += ` · ${num(L.sb)} SB`;
  if (p.line2) t += `; on the mound ${p.line2.w}–${p.line2.l}, ${p.line2.era.toFixed(2)} ERA`;
  return t;
}
const initials = (name) => name.split(" ").filter((w) => !SUFFIX.test(w)).map((w) => w[0]).slice(0, 3).join("");
// sequential steps of the club's color for the heatmap: [lower bound, mix %]
const HEAT = [[0, 16], [2, 34], [4, 56], [6, 78], [8, 100]];
const heatStep = (w) => HEAT.reduce((k, [lo], i) => (w >= lo ? i : k), 0);

function renderModern() {
  const M = state.modern[state.team.id];
  const P = M?.players || [];
  markSkip("modern", !P.length);
  if (!P.length) return;
  const tc = COLORS[state.team.id];
  const club = state.team.teamName;
  $("#modern-lede").textContent = `The best players to wear the ${club} uniform in the last twenty seasons (${M.from}–${M.to}), ranked by WAR, the wins each was worth above a replacement player. Only seasons with this club count, and a player needs at least ${word(M.min)} of them to qualify, unless he's on the ${M.to} club, so a short stay in the past doesn't put anyone on the list.`;

  // three superlatives
  const marks = [];
  if (M.best) marks.push(["Best single season", fmtWar(M.best.war), "WAR", `${M.best.name}, ${M.best.year}`]);
  if (M.leader) marks.push([`Best of the ${M.to} club`, fmtWar(M.leader.war), "WAR", `${M.leader.name}, ${plural(M.leader.seasons, "season")} here`]);
  if (M.longest) marks.push(["Longest stay", M.longest.seasons, "seasons", `${M.longest.name}, ${yrs(M.longest.from, M.longest.to)}`]);
  $("#modern-marks").innerHTML = marks.map(([k, v, unit, who]) =>
    `<div class="mstat"><span class="mstat-k">${esc(k)}</span><span class="mstat-v">${esc(v)}<small>${esc(unit)}</small></span><span class="mstat-who">${esc(who)}</span></div>`).join("");

  // the cards
  $("#modern").innerHTML = P.slice(0, MODERN_CARDS).map((p, i) => {
    const ph = modernPhoto(p);
    const art = ph
      ? `<img src="${esc(ph.src)}" alt="" loading="lazy"${ph.pos ? ` style="object-position:${esc(ph.pos)}"` : ""}>`
      : `<span class="mcard-mono" aria-hidden="true">${esc(initials(p.name))}</span>`;
    return `<article class="mcard" style="--tc:${tc}" aria-label="${esc(p.name)}, ${fmtWar(p.war)} WAR">
      <div class="mcard-face">
        <div class="mcard-art${ph?.headshot ? " headshot" : ""}${ph ? "" : " none"}">
          ${art}
          <span class="mcard-rank">${i + 1}</span>
          ${p.active ? `<span class="mcard-now">On the ${M.to} club</span>` : ""}
        </div>
        <div class="mcard-band">
          <span class="mcard-name">${esc(p.name)}</span>
          <span class="mcard-pos">${esc(modernPos(p))}</span>
        </div>
        <div class="mcard-war"><b>${fmtWar(p.war)}</b><small>WAR</small></div>
      </div>
      <div class="mcard-back">
        <div class="mcard-meta">${yrs(p.from, p.to)} · ${plural(p.seasons, "season")}</div>
        <div class="mcard-line">${modernLine(p)}</div>
        <div class="mcard-peak">Best year: ${p.peak[0]}, ${fmtWar(p.peak[1])} WAR</div>
        ${ph && !ph.headshot ? `<a class="credit" href="${esc(ph.file)}" target="_blank" rel="noopener">Photo: Wikimedia Commons</a>` : ""}
      </div>
    </article>`;
  }).join("");

  // the heatmap: one row per player, one column per season
  const years = range(M.from, M.to);
  $("#mheat-note").textContent = `WAR in each season with the club, darker for bigger years. Each player's best season is labeled. Hover a square for the number.`;
  const cell = (p, y) => {
    const w = p.yr.get(y);
    if (w == null) return `<span class="mh-c mh-out" role="cell" aria-label="${y}: not with the club"></span>`;
    const neg = w < 0, k = heatStep(w), pk = y === p.peak[0];
    const bg = neg ? "" : ` style="--mix:${HEAT[k][1]}%"`;
    return `<span class="mh-c${neg ? " mh-neg" : ` mh-s${k}`}${pk ? " mh-peak" : ""}" role="cell" data-y="${y}" data-w="${w}" data-n="${esc(p.name)}"${bg} aria-label="${y}: ${fmtWar(w)} WAR">${pk ? `<i>${fmtWar(w)}</i>` : ""}</span>`;
  };
  const rows = P.map((p) => ({ ...p, yr: new Map(p.years) }));
  $("#mheat").style.setProperty("--tc", tc);
  $("#mheat").style.setProperty("--cols", years.length);
  $("#mheat").innerHTML =
    `<div class="mh-row mh-head" role="row"><span class="mh-name" role="columnheader"></span>${years.map((y) =>
      `<span class="mh-y" role="columnheader">${y === M.from || y === M.to || (y % 5 === 0 && y - M.from > 2 && M.to - y > 2) ? `’${String(y).slice(2)}` : ""}</span>`).join("")}<span class="mh-tot" role="columnheader">WAR</span></div>` +
    rows.map((p, i) => `<div class="mh-row${i === MODERN_CARDS - 1 ? " mh-cut" : ""}" role="row">
      <span class="mh-name" role="rowheader"><b>${i + 1}</b> ${esc(p.name)}</span>
      ${years.map((y) => cell(p, y)).join("")}
      <span class="mh-tot" role="cell">${fmtWar(p.war)}</span></div>`).join("");
  $("#mheat-key").innerHTML = `<span class="mk-k">WAR in a season</span>` +
    HEAT.map(([lo], i) => `<span class="mk"><i class="mh-c mh-s${i}" style="--mix:${HEAT[i][1]}%;--tc:${tc}"></i>${i === HEAT.length - 1 ? `${lo}+` : `${lo}–${HEAT[i + 1][0]}`}</span>`).join("") +
    `<span class="mk"><i class="mh-c mh-neg"></i>Below zero</span><span class="mk"><i class="mh-c mh-out"></i>Not with the club</span>`;
  const tip = $("#mtip"), wrap = $(".mheat-wrap");
  $("#mheat").onmouseover = (e) => {
    const c = e.target.closest(".mh-c[data-y]");
    if (!c) { tip.hidden = true; return; }
    const r = c.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
    tip.innerHTML = `<b>${fmtWar(+c.dataset.w)}</b> WAR<br>${esc(c.dataset.n)}, ${c.dataset.y}`;
    tip.style.left = `${r.left - wr.left + r.width / 2}px`;
    tip.style.top = `${r.top - wr.top}px`;
    tip.hidden = false;
  };
  $("#mheat").onmouseleave = () => (tip.hidden = true);

  const more = P.slice(MODERN_CARDS);
  $("#modern-also").innerHTML = (more.length
    ? `<span class="also-k">Next in line</span> ${more.map((p) => `<span class="also-p">${esc(p.name)} <small>${fmtWar(p.war)} WAR</small></span>`).join("")}`
    : "") + `<p class="mq">${plural(M.qualified, "player")} qualified: ${word(M.min)} or more seasons with the club since ${M.from}, or a place on the ${M.to} club.</p>`;
  $("#modern-how").textContent = `WAR (wins above replacement) comes from the MLB Stats API. It counts batting, baserunning, fielding and the position a player plays, or for a pitcher the runs he allowed and the innings he covered, and turns them into wins over a freely available replacement. ` +
    `Only the ${M.from}–${M.to} seasons count, and only the part spent with this club: a player traded in midseason keeps only what he did here. A player qualifies with ${word(M.min)} or more seasons here (a season counts if he played in at least one game for the club), or if he played for the club in ${M.to}, so today's stars are in the running however new they are. Pitchers' batting is left out, except for two-way players.`;
}
const yrs = (a, b) => (a === b ? `${a}` : `${a}–${String(b).slice(Math.floor(a / 100) === Math.floor(b / 100) ? 2 : 0)}`);
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// =====================================================================
// THE DUGOUT & THE BOOTH
// =====================================================================
function renderDugout() {
  const { managers = [], people = [] } = teamPeople();
  markSkip("dugout", !managers.length && !people.length);
  // The longest-serving skippers, plus whoever managed the club most recently.
  const current = managers.reduce((c, m) => (!c || m.to > c.to || (m.to === c.to && m.from > c.from) ? m : c), null);
  const ranked = [...managers].sort((a, b) => b.seasons - a.seasons || b.titles.length - a.titles.length || b.W - a.W);
  const top = ranked.slice(0, 6);
  if (current && !top.includes(current)) top.splice(5, 1, current);
  top.sort((a, b) => a.from - b.from);
  $("#skippers").innerHTML = top.map((m) => {
    const rec = m.W + m.L ? `${num(m.W)}–${num(m.L)} <small>(${fmtPct(pct(m.W, m.L))})</small>` : "";
    const hon = m.titles.length ? `<div class="sk-stars" title="World Series titles">${"★".repeat(m.titles.length)} <span>${plural(m.titles.length, "title")}</span></div>`
      : m.pennants.length ? `<div class="sk-stars pen"><span>${plural(m.pennants.length, "pennant")}</span></div>` : "";
    return `<article class="skipper">
      <img src="${esc(facePhoto(m.id) || headshot(m.id, 240))}" alt="" loading="lazy">
      <div class="sk-body">
        <h5>${esc(m.name)}</h5>
        ${m === current ? `<div class="sk-now">Current manager</div>` : ""}
        <div class="sk-years">${spans(m.years)} · ${plural(m.seasons, "season")}</div>
        ${rec ? `<div class="sk-rec">${rec}</div>` : ""}
        ${hon}
      </div>
    </article>`;
  }).join("");
  $("#all-managers-sum").textContent = `See all ${managers.length} managers in club history`;
  $("#managers-list").innerHTML = managers.map((m) => `<li><span>${spans(m.years)}</span> ${esc(m.name)}${m.titles.length ? ` <b title="World Series titles">${"★".repeat(m.titles.length)}</b>` : ""}</li>`).join("");
  $(".all-managers").hidden = !managers.length;

  $("#voices").innerHTML = people.map((p) => {
    const initials = p.name.split(/\s+/).map((w) => w[0]).filter((c) => /[A-Z]/.test(c)).slice(0, 2).join("");
    return `<article class="voice">
      <div class="voice-photo">${p.photo ? `<img src="${esc(p.photo.src)}" alt="" loading="lazy">` : `<span>${esc(initials)}</span>`}</div>
      <div class="voice-body">
        <div class="voice-role">${esc(p.role)}<span> · ${esc(p.years)}</span></div>
        <h5>${esc(p.name)}</h5>
        ${p.call ? `<q class="voice-call">${esc(p.call)}</q>` : ""}
        <p>${esc(p.blurb || "")}</p>
        ${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">Read more on Wikipedia</a>` : ""}
      </div>
    </article>`;
  }).join("");
  $$(".subhead")[1].hidden = !people.length;
}

// =====================================================================
// RETIRED NUMBERS
// =====================================================================
const MIC = `<svg viewBox="0 0 24 24" aria-label="Broadcaster"><path fill="currentColor" d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zm-7 9a7 7 0 0 0 6 6.9V21H8v2h8v-2h-3v-3.1A7 7 0 0 0 19 11h-2a5 5 0 0 1-10 0z"/></svg>`;
function renderNumbers() {
  const list = state.retired[state.team.id] || [];
  const isJackie = (r) => r.no === "42" && /Jackie Robinson/.test(r.name);
  const hasJackie = list.some(isJackie);
  markSkip("numbers", !list.length);
  $("#numbers-lede").textContent =
    `${plural(list.length, "honor")} hang${list.length === 1 ? "s" : ""} on the wall. These numbers will never be issued again.`;
  const banner = (r, extra = "") => {
    const isNum = /^\d+$/.test(r.no), mic = /🎤/.test(r.no);
    const tags = (r.tags || []).filter((t) => t === "hof" || t === "broadcaster" || t === "honorary");
    return `<div class="num-banner${extra}"${extra ? ` title="Retired across all of Major League Baseball"` : ""}>
      <span class="num${isNum ? "" : " num-word"}${r.no.length > 2 && isNum ? " num-long" : ""}">${mic ? MIC : esc(r.no)}</span>
      <span class="num-name">${esc(r.name)}</span>
      <span class="num-year">${r.year ? `retired ${r.year}` : ""}</span>
      ${extra ? `<span class="num-tag">EVERY TEAM · 1997</span>` : tags.includes("hof") ? `<span class="num-tag" title="Hall of Famer">HOF</span>` : ""}
    </div>`;
  };
  // Jackie's 42 hangs first, in gold, on his own club's wall
  const ordered = hasJackie ? [list.find(isJackie), ...list.filter((r) => !isJackie(r))] : list;
  $("#numbers").innerHTML = ordered.map((r) => banner(r, isJackie(r) ? " gold" : "")).join("");
  const note = $("#numbers-note");
  note.hidden = !hasJackie;
  note.textContent = hasJackie
    ? "Jackie Robinson broke baseball's color line in Brooklyn on April 15, 1947. The Dodgers retired his 42 in 1972, and in 1997, on the fiftieth anniversary, Major League Baseball retired it for every team. It's the only number no club will ever issue again."
    : "";
}

// =====================================================================
// HALL OF FAME
// =====================================================================
const HOF_PAGE = 12;
let hofAll = false;
function renderHof() {
  const list = (state.history[state.team.id] || {}).hof || [];
  markSkip("hof", !list.length);
  if (!list.length) return clearPage("hof", "hof");
  $("#hof-lede").textContent = `${plural(list.length, "member")} of the Hall of Fame wear this club's cap on their plaque.`;
  const shown = hofAll ? list : list.slice(0, HOF_PAGE);
  $("#hof").innerHTML = shown.map((x) => `
    <div class="plaque">
      <img src="${esc(legendPhoto(x.id)?.src || facePhoto(x.id) || headshot(x.id, 180))}" alt="" loading="lazy">
      <h4>${esc(x.name)}</h4>
      <div>Inducted ${x.inducted}${x.pos && x.pos !== "X" ? " · " + esc(x.pos) : ""}</div>
    </div>`).join("");
  const more = $("#hof-more");
  more.hidden = list.length <= HOF_PAGE;
  more.textContent = hofAll ? "Show fewer" : `Show all ${list.length} plaques`;
  more.onclick = () => { hofAll = !hofAll; renderHof(); };
}

// =====================================================================
// TROPHY CASE
// =====================================================================
const TROPHY = (fill) => `<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="${fill}" stroke="#2a2118" stroke-width="1.2" d="M9 4h14v6a7 7 0 0 1-14 0zM9 6H4v3a5 5 0 0 0 5 5M23 6h5v3a5 5 0 0 1-5 5M14 17h4v5h-4zM10 22h12v3H10zM8 25h16v3H8z"/></svg>`;
function renderTrophies() {
  const A = (state.history[state.team.id] || {}).awards || [];
  const groups = [["MVP", "Most Valuable Player", "#d4a830"], ["Cy Young", "Cy Young Award", "#c9c9c9"], ["Rookie of the Year", "Rookie of the Year", "#c27a3a"]];
  markSkip("trophies", !A.length);
  const html = groups.map(([key, label, color]) => {
    const list = A.filter((a) => a.award === key);
    return `<div class="trophy-col"><h4>${TROPHY(color)}${label}<small>${list.length}</small></h4>
      ${list.length ? `<ul class="trophy-list">${list.map((a) => `<li><b>${a.season}</b><span>${esc(a.name)}</span></li>`).join("")}</ul>`
        : `<p class="trophy-empty">The shelf awaits its first.</p>`}</div>`;
  });
  // Gold Gloves (since 1958) and Silver Sluggers (since 1980) come by the dozen, so list them by player.
  const multi = [["Gold Glove", "Gold Gloves", "#e3b23c", "Fielding's top honor, since 1957"], ["Silver Slugger", "Silver Sluggers", "#b8bcc2", "The best bat at each position, since 1980"]];
  html.push(...multi.map(([key, label, color, note]) => {
    const list = A.filter((a) => a.award === key), by = new Map();
    for (const a of list) by.set(a.id, [...(by.get(a.id) || []), a]);
    const rows = [...by.values()].sort((x, y) => y.length - x.length || x[0].season - y[0].season);
    return `<div class="trophy-col"><h4>${TROPHY(color)}${label}<small>${list.length}</small></h4>
      <p class="trophy-note">${note}</p>
      ${rows.length ? `<ul class="trophy-list">${rows.map((r) => `<li><b>${r.length > 1 ? "×" + r.length : ""}</b><span>${esc(r[0].name)}</span><i>${esc(spans(r.map((a) => a.season)))}</i></li>`).join("")}</ul>`
        : `<p class="trophy-empty">The shelf awaits its first.</p>`}</div>`;
  }));
  $("#trophies").innerHTML = html.join("");
}

// =====================================================================
// HOME FIELDS
// =====================================================================
function renderParks() {
  const P = state.parks, info = (state.photos[state.team.id] || {}).parks || {};
  markSkip("parks", !P.length);
  if (!P.length) return clearPage("parks", "parks");
  $("#parks-lede").textContent = P.length === 1 ? `One ballpark has been home since ${P[0].from}.`
    : `${word(P.length)[0].toUpperCase() + word(P.length).slice(1)} ballparks have been home since ${P[0].from}.`;
  $("#parks").innerHTML = P.map((p, i) => {
    const d = info[p.key] || {}, S = seasonsIn(p.from, p.to), r = record(S);
    const titles = S.filter((s) => s.champ).map((s) => s.year);
    const now = i === P.length - 1 && p.to >= state.seasons.at(-1).year;
    // The same name twice: either a return to the same park, or a new park that took the old one's name.
    const prev = P.slice(0, i).filter((q) => q.name === p.name);
    const back = prev.find((q) => q.id === p.id);
    const note = back ? `Back home after ${listify(P.slice(P.indexOf(back) + 1, i).map((q) => `${q.from === q.to ? q.from : `${q.from}–${String(q.to).slice(2)}`} at ${q.name}`))}.`
      : prev.length ? `A new ballpark that took the name of the ${prev[0].from}–${prev.at(-1).to} original.` : "";
    const span = now ? `${p.from} to today` : p.from === p.to ? `${p.from}` : `${p.from}–${p.to}`;
    return `<article class="park${i % 2 ? " flip" : ""}">
      <div class="park-photo">${d.src ? `<button data-i="${i}"><img src="${esc(d.src)}" alt="${esc(p.name)}" loading="lazy"></button>` : `<div class="park-blank">${esc(p.name)}</div>`}
        <span class="park-stamp">${now ? "Home today" : span}</span></div>
      <div class="park-body">
        <h4>${esc(p.name)}</h4>
        <div class="park-meta">${span} · ${plural(S.length, "season")}${p.aka?.length ? ` · also ${esc(listify(p.aka))}` : ""}</div>
        ${note ? `<div class="park-note">${esc(note)}</div>` : ""}
        <div class="park-rec">${num(r.W)}–${num(r.L)} <small>${fmtPct(r.p)}</small>${titles.length ? ` <span class="park-titles">★ ${titles.join(", ")}</span>` : ""}</div>
        ${d.blurb ? `<p>${esc(d.blurb)}</p>` : ""}
        ${d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener">Read more on Wikipedia</a>` : ""}
      </div>
    </article>`;
  }).join("");
  const shots = P.map((p) => info[p.key]).map((d, i) => d?.src ? { src: d.src, title: P[i].name, caption: d.blurb, url: d.url, file: d.file, year: null } : null);
  $$("#parks .park-photo button").forEach((b) => (b.onclick = () => {
    const list = shots.filter(Boolean);
    openLightbox(list, list.indexOf(shots[+b.dataset.i]));
  }));
}

// =====================================================================
// SCRAPBOOK + LIGHTBOX
// =====================================================================
const decadeOf = (y) => (y ? Math.floor(y / 10) * 10 : null);
function renderArchive() {
  const A = state.archive;
  markSkip("scrapbook", !A.length);
  const decades = [...new Set(A.map((a) => decadeOf(a.year)))].sort((a, b) => (a ?? 1e4) - (b ?? 1e4));
  $("#decades").innerHTML = decades.length > 2
    ? [`<button data-d="" class="${state.decade == null ? "on" : ""}">All <small>${A.length}</small></button>`,
       ...decades.map((d) => `<button data-d="${d ?? "x"}" class="${String(state.decade) === String(d ?? "x") ? "on" : ""}">${d ? d + "s" : "Undated"} <small>${A.filter((a) => decadeOf(a.year) === d).length}</small></button>`)].join("")
    : "";
  $$("#decades button").forEach((b) => (b.onclick = () => { state.decade = b.dataset.d === "" ? null : b.dataset.d; renderArchive(); }));
  const shown = state.decade == null ? A : A.filter((a) => String(decadeOf(a.year) ?? "x") === state.decade);
  $("#archive").innerHTML = shown.map((a, i) => `
    <button class="snap" data-i="${i}" style="--rot:${(((i * 37) % 7) - 3) * 0.55}deg">
      <img src="${esc(a.src)}" alt="${esc(a.title)}" loading="lazy">
      <span class="snap-cap">${a.year ? `<b>${a.year}</b>` : ""}${esc(a.title)}</span>
    </button>`).join("");
  $$("#archive .snap").forEach((b) => (b.onclick = () => openLightbox(shown, +b.dataset.i)));
}

const lb = $("#lightbox");
const LB = { list: [], i: 0 };
lb.addEventListener("click", (e) => { if (e.target === lb) lb.close(); });
lb.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") { lbStep(1); e.preventDefault(); }
  if (e.key === "ArrowLeft") { lbStep(-1); e.preventDefault(); }
});
$("#lb-close").onclick = () => lb.close();
$("#lb-prev").onclick = () => lbStep(-1);
$("#lb-next").onclick = () => lbStep(1);
function lbStep(d) { if (LB.list.length > 1) showLightbox((LB.i + d + LB.list.length) % LB.list.length); }
function openLightbox(list, i = 0) {
  if (!list?.length || i < 0) return;
  LB.list = list;
  showLightbox(i);
  if (!lb.open) lb.showModal();
}
function showLightbox(i) {
  const a = LB.list[i];
  LB.i = i;
  $("#lb-img").src = a.src;
  $("#lb-img").alt = a.title;
  $("#lb-title").textContent = (a.year ? a.year + " — " : "") + a.title;
  $("#lb-cap").textContent = a.caption || "";
  $("#lb-wiki").href = a.url || "#";
  $("#lb-wiki").hidden = !a.url;
  $("#lb-wiki").textContent = /commons\.wikimedia/.test(a.url || "") ? "See it on Wikimedia Commons" : "Read the full story on Wikipedia";
  $("#lb-file").href = a.file || "#";
  $("#lb-file").hidden = !a.file;
  const many = LB.list.length > 1;
  $("#lb-prev").hidden = $("#lb-next").hidden = !many;
  $("#lb-count").textContent = many ? `${i + 1} of ${LB.list.length}` : "";
}

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
    wall.push(`<div class="wpen" style="--pc:${COLORS[c.winner.id] || "#1e3557"}" title="${y}: ${esc(c.winner.name)} def. ${esc(c.loser.name)} (${c.result})">
      <img src="${logo(c.winner.id)}" alt="${esc(c.winner.name)}" loading="lazy"><span>${y}</span></div>`);
  }
  $("#wall").innerHTML = wall.join("");
}

init().catch((err) => {
  console.error(err);
  $("#franchise-empty").innerHTML = `<p class="empty-big">Rain delay</p><p>Couldn't reach the MLB Stats API. ${esc(err.message)}</p>`;
});
