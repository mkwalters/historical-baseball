// The Grandstand Almanac, Vol. IV — a franchise almanac. Vanilla JS + the public MLB Stats API.
//
// Layout of this file:
//   helpers · data access · state · boot · front page · search · routing · chapters (pages)
//   · the club (one render function per chapter) · lightbox · the league page
const API = "https://statsapi.mlb.com/api/v1";
const SITE = "The Grandstand Almanac";

// Bundle mode: scripts/bundle_artifact.mjs builds a copy of the site that runs fully offline, reading
// pre-fetched API responses and embedded images instead of calling outside hosts. It sets this flag.
const BUNDLE = { on: !!window.ALMANAC_BUNDLE, teams: null, logos: {}, team: {}, imgs: {} };
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
const color = (id) => COLORS[id] || "#1e3557";
// Division ids in the order a fan reads the standings.
const DIVISIONS = [[201, "American League", "East"], [202, "American League", "Central"], [200, "American League", "West"],
  [204, "National League", "East"], [205, "National League", "Central"], [203, "National League", "West"]];

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (w, l) => (w + l ? w / (w + l) : 0);
const fmtPct = (p) => p.toFixed(3).replace(/^0/, "");
const num = (n) => (n == null ? "?" : Number(n).toLocaleString());
const plural = (n, word, pl = word + "s") => `${n} ${n === 1 ? word : pl}`;
const listify = (a) => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a.at(-1));
const json = (url) => fetch(url).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const word = (n) => WORDS[n] ?? String(n);
const Word = (n) => word(n).replace(/^[a-z]/, (c) => c.toUpperCase());
const ORD = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth", "Eleventh", "Twelfth"];
const nth = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
const yrs = (a, b) => (a === b ? `${a}` : `${a}–${String(b).slice(Math.floor(a / 100) === Math.floor(b / 100) ? 2 : 0)}`);
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
// [1903, 1904, 1905, 1910] -> "1903–05, 1910"
function spans(years) {
  const out = [];
  for (const y of years) {
    const last = out.at(-1);
    if (last && y === last[1] + 1) last[1] = y; else out.push([y, y]);
  }
  return out.map(([a, b]) => yrs(a, b)).join(", ");
}
// "José Ramírez" -> "jose ramirez", for matching what people type
const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

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
  teams: [], champions: {}, legends: {}, photos: {}, history: {}, people: {}, retired: {}, modern: {}, records: {}, nohitters: [],
  view: "franchise", team: null, failed: false, seasons: [], eras: [], parks: [], archive: [],
  decade: null, pinned: null, honorSort: { key: "titles", dir: -1 }, since: 0, climbPins: null,
};
const teamById = (id) => state.teams.find((t) => t.id === id);
// "New York" for the Yankees; the Athletics' full name has no city in it, so fall back to where they play.
const cityOf = (t) => (t.name.endsWith(t.teamName) ? t.name.slice(0, -t.teamName.length).trim() : t.franchiseName) || t.locationName || "";

async function init() {
  if (BUNDLE.on) {
    const b = await json("data/bundle/teams.json");
    Object.assign(BUNDLE, { teams: { teams: b.teams || [] }, logos: b.logos || {} });
  }
  const [teamsRes, champions, legends, photos, history, people, retired, modern, records, nohitters] = await Promise.all([
    get(`/teams?sportId=1&season=${new Date().getFullYear()}`),
    json("data/champions.json"), json("data/legends.json"), json("data/photos.json"), json("data/history.json"),
    json("data/people.json"), json("data/retired.json"), json("data/modern.json"), json("data/league.json"),
    json("data/nohitters.json"),
  ]);
  Object.assign(state, { champions, legends, photos, history, people, retired, modern, records, nohitters: Array.isArray(nohitters) ? nohitters : [] });
  const divOrder = (t) => { const i = DIVISIONS.findIndex(([id]) => id === t.division?.id); return i < 0 ? 99 : i; };
  state.teams = teamsRes.teams.filter((t) => t.sport?.id === 1)
    .sort((a, b) => divOrder(a) - divOrder(b) || a.teamName.localeCompare(b.teamName));

  renderPicker();
  renderFrontSnaps();
  renderLeague();
  league.setup();
  league.go(null, { scroll: false });
  setupSearch();
  $$(".tab").forEach((b) => (b.onclick = () => showView(b.dataset.view)));
  $("#home-link").onclick = (e) => { e.preventDefault(); goHome(); };
  $("#surprise").onclick = () => openClub(shuffle(state.teams.filter((t) => t !== state.team))[0].id);
  $("#reshuffle").onclick = renderFrontSnaps;
  document.addEventListener("keydown", onKey);
  // Anything marked data-club opens that club's almanac (optionally at data-page); data-game opens a no-hitter's scorecard.
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-club]");
    if (el) { e.preventDefault(); openClub(+el.dataset.club, el.dataset.page); return; }
    const game = e.target.closest("[data-game]");
    if (game) openGame(+game.dataset.game);
  });
  window.addEventListener("popstate", applyRoute);
  await applyRoute();
}

// A portrait that fails to load becomes the silhouette; a scrapbook photo that fails just leaves the page.
document.addEventListener("error", (e) => {
  const img = e.target;
  if (img.tagName !== "IMG" || img.dataset.failed) return;
  img.dataset.failed = "1";
  const snap = img.closest(".snap, .oct-photo, .sc-photo");
  if (snap) snap.hidden = true;
  else if (img.closest(".tcard-art, .mcard-art, .skipper, .plaque, .voice-photo")) img.src = SILHOUETTE;
}, true);

// =====================================================================
// FRONT PAGE: the club picker and a few loose photos
// =====================================================================
function renderPicker() {
  const club = (t) => `<button class="club" data-club="${t.id}" style="--tc:${color(t.id)}">
      <img alt="" src="${logo(t.id)}" loading="lazy"><span><b>${esc(t.teamName)}</b><small>${esc(cityOf(t))}</small></span></button>`;
  const groups = DIVISIONS.map(([id, league, div]) => ({ league, div, teams: state.teams.filter((t) => t.division?.id === id) })).filter((g) => g.teams.length);
  const grouped = groups.reduce((n, g) => n + g.teams.length, 0) === state.teams.length;
  $("#picker").innerHTML = grouped
    ? groups.map((g) => `<section class="division"><h3><small>${esc(g.league)}</small> ${esc(g.div)}</h3>${g.teams.map(club).join("")}</section>`).join("")
    : `<section class="division flat">${state.teams.map(club).join("")}</section>`;
  // the rail: the same clubs as one row of logos, with a gap between divisions
  $("#rail").innerHTML = state.teams.map((t, i) => {
    const gap = i && grouped && t.division?.id !== state.teams[i - 1].division?.id;
    return `<button class="rail-btn${gap ? " gap" : ""}" data-club="${t.id}" title="${esc(t.name)}" aria-label="${esc(t.name)}"><img alt="" src="${logo(t.id)}" loading="lazy"></button>`;
  }).join("");
}

// Four photos from four different clubs' scrapbooks, reshuffled on every visit.
let frontPicks = [];
function renderFrontSnaps() {
  const perTeam = state.teams.map((t) => ((state.photos[t.id] || {}).archive || []).map((a) => ({ ...a, team: t }))).filter((l) => l.length);
  $("#front-scrap").hidden = perTeam.length < 4;
  if (perTeam.length < 4) return;
  frontPicks = shuffle(perTeam).slice(0, 4).map((l) => shuffle(l)[0]);
  $("#front-snaps").innerHTML = frontPicks.map((a, i) => `
    <button class="snap" data-i="${i}" style="--rot:${[-1.6, 1.1, -0.7, 1.7][i]}deg">
      <img src="${esc(a.src)}" alt="${esc(a.title)}" loading="lazy">
      <span class="snap-cap">${a.year ? `<b>${a.year}</b>` : ""}${esc(a.title)}<i>${esc(a.team.name)}</i></span>
    </button>`).join("");
  $$("#front-snaps .snap").forEach((b) => (b.onclick = () => openLightbox(frontPicks, +b.dataset.i)));
}

// =====================================================================
// SEARCH: every name in the almanac, across all thirty clubs
// =====================================================================
// Which chapter a hit opens, best first.
const SEARCH_PAGES = ["legends", "modern", "hof", "numbers", "trophies", "dugout"];
let searchIndex = null;
function buildSearchIndex() {
  const byKey = new Map();
  const add = (t, name, page, tag) => {
    if (!name) return;
    const key = t.id + "|" + fold(name);
    const e = byKey.get(key) || { team: t, name, folded: fold(name), page, tags: [] };
    if (SEARCH_PAGES.indexOf(page) < SEARCH_PAGES.indexOf(e.page)) e.page = page;
    if (tag && !e.tags.includes(tag)) e.tags.push(tag);
    byKey.set(key, e);
  };
  for (const t of state.teams) {
    (state.legends[t.id] || []).forEach((p, i) => add(t, p.name, "legends", i < LEGEND_CARDS ? `Legend No. ${i + 1}` : "Legend"));
    ((state.modern[t.id] || {}).players || []).forEach((p, i) => add(t, p.name, "modern", i < MODERN_CARDS ? `Modern star No. ${i + 1}` : "Modern star"));
    ((state.history[t.id] || {}).hof || []).forEach((p) => add(t, p.name, "hof", "Hall of Fame"));
    (state.retired[t.id] || []).forEach((r) => add(t, r.name, "numbers", /^\d+$/.test(r.no) ? `No. ${r.no} retired` : "Honored on the wall"));
    for (const g of state.nohitters) if (g.t === t.id) for (const [name] of g.p) add(t, name, "trophies", g.pg ? "Perfect game" : g.p.length > 1 ? "Combined no-hitter" : "No-hitter");
    for (const a of (state.history[t.id] || {}).awards || []) if (BIG_AWARDS.has(a.award)) add(t, a.name, "trophies", a.award === "Cy Young" ? "Cy Young" : a.award === "MVP" ? "MVP" : "Rookie of the Year");
    const P = state.people[t.id] || {};
    (P.managers || []).forEach((m) => add(t, m.name, "dugout", "Manager"));
    (P.people || []).forEach((p) => add(t, p.name, "dugout", p.role));
  }
  return [...byKey.values()];
}
function search(q) {
  q = fold(q.trim());
  if (q.length < 2) return [];
  searchIndex ||= buildSearchIndex();
  const starts = (s) => s.startsWith(q) || s.includes(" " + q);
  const clubs = state.teams.filter((t) => starts(fold(t.name))).map((t) => ({ team: t, name: t.name, club: true, tags: ["Open the almanac"] }));
  const hits = searchIndex.filter((e) => e.folded.includes(q))
    .map((e) => ({ ...e, score: (e.folded.startsWith(q) ? 0 : starts(e.folded) ? 1 : 2) * 10 + SEARCH_PAGES.indexOf(e.page) }))
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
  return [...clubs, ...hits].slice(0, 9);
}
function setupSearch() {
  const input = $("#search-input"), list = $("#search-results");
  let hits = [], active = -1;
  const close = () => { list.hidden = true; input.setAttribute("aria-expanded", "false"); active = -1; };
  const mark = () => $$("li", list).forEach((li, i) => li.setAttribute("aria-selected", i === active));
  const pick = (hit) => { input.value = ""; close(); input.blur(); openClub(hit.team.id, hit.page); };
  const render = () => {
    hits = search(input.value);
    active = hits.length ? 0 : -1;
    list.innerHTML = hits.length
      ? hits.map((x, i) => `<li role="option" data-i="${i}"><img src="${logo(x.team.id)}" alt=""><span><b>${esc(x.name)}</b><small>${x.club ? "" : esc(x.team.teamName) + " · "}${esc(x.tags.slice(0, 3).join(" · "))}</small></span></li>`).join("")
      : `<li class="none">Nobody by that name in the almanac.</li>`;
    list.hidden = input.value.trim().length < 2;
    input.setAttribute("aria-expanded", String(!list.hidden));
    mark();
  };
  input.addEventListener("input", render);
  input.addEventListener("focus", () => { if (input.value.trim().length >= 2) render(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { close(); return; }
    if (list.hidden || !hits.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { active = (active + (e.key === "ArrowDown" ? 1 : -1) + hits.length) % hits.length; mark(); e.preventDefault(); }
    if (e.key === "Enter" && hits[active]) { pick(hits[active]); e.preventDefault(); }
  });
  list.addEventListener("mousedown", (e) => e.preventDefault()); // keep focus in the input while clicking a result
  list.addEventListener("click", (e) => { const li = e.target.closest("li[data-i]"); if (li) pick(hits[+li.dataset.i]); });
  document.addEventListener("click", (e) => { if (!e.target.closest("#search")) close(); });
}

// =====================================================================
// BOOKS: a set of chapters read one at a time, with a progress strip above and a pager below.
// The club almanac is one book and the League is another.
// =====================================================================
function makeBook(root, { kicker, noun, onShow = () => {} }) {
  const book = {
    page: null, pages: [],
    el: (k) => $(`.page[data-page="${k}"]`, root),
    label: (k) => book.el(k).dataset.label,
    // (Re)count the chapters: any marked data-skip are left out.
    setup() {
      book.pages = $$(".page", root).filter((el) => !el.dataset.skip).map((el) => el.dataset.page);
      book.pages.forEach((k, n) => { const el = $(".kicker", book.el(k)); if (el) el.textContent = kicker(n); });
      $(".progress", root).innerHTML = `<div class="progress-track"><div class="progress-fill"></div></div>` +
        book.pages.map((k, i) => `<button class="pstop" data-k="${k}" title="${esc(book.label(k))}"><i>${i + 1}</i><span>${esc(book.label(k))}</span></button>`).join("");
      $$(".pstop", root).forEach((b) => (b.onclick = () => book.go(b.dataset.k)));
    },
    go(k, { scroll = true } = {}) {
      if (!book.pages.includes(k)) k = book.pages[0];
      const from = book.pages.indexOf(book.page), to = book.pages.indexOf(k);
      book.page = k;
      for (const el of $$(".page", root)) {
        const on = el.dataset.page === k;
        el.hidden = !on;
        if (on) {
          el.classList.remove("turn-fwd", "turn-back");
          void el.offsetWidth; // restart the animation
          el.classList.add(to >= from ? "turn-fwd" : "turn-back");
        }
      }
      $$(".pstop", root).forEach((b, i) => {
        b.classList.toggle("current", i === to);
        b.classList.toggle("done", i < to);
        if (i === to) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
      });
      $(".progress-fill", root).style.width = `${(to / Math.max(1, book.pages.length - 1)) * 100}%`;
      const prev = book.pages[to - 1], next = book.pages[to + 1];
      $(".pager-prev", root).hidden = !prev;
      if (prev) $(".pager-prev .pager-label", root).textContent = book.label(prev);
      $(".pager-next .pager-label", root).textContent = next ? "Next: " + book.label(next) : "Back to the start";
      $(".pager-pos", root).textContent = `${noun} ${to + 1} of ${book.pages.length}`;
      onShow(k);
      syncURL();
      if (scroll) { // a new chapter starts at its top, just under the progress strip
        const top = $(".pages", root).getBoundingClientRect().top + window.scrollY - $(".progress", root).offsetHeight - 18;
        if (window.scrollY > top) window.scrollTo({ top, behavior: "smooth" });
      }
    },
    step(d) {
      const i = book.pages.indexOf(book.page) + d;
      if (i >= 0 && i < book.pages.length) book.go(book.pages[i]);
    },
    // Redraw whatever on the current chapter measures itself (charts can't while hidden).
    refresh() { if (book.page) onShow(book.page); },
  };
  $(".pager-prev", root).onclick = () => book.step(-1);
  $(".pager-next", root).onclick = () => (book.page === book.pages.at(-1) ? book.go(book.pages[0]) : book.step(1));
  return book;
}
const club = makeBook($("#franchise"), { kicker: (n) => `Chapter the ${ORD[n]}`, noun: "Chapter", onShow: (k) => { if (k === "ledger") renderTimeline(); } });
const league = makeBook($("#view-league"), { kicker: (n) => `League Bulletin No. ${n + 1}`, noun: "Bulletin", onShow: (k) => { if (k === "climb") renderClimb(); } });
const openBook = () => (state.view === "league" ? league : state.team && !state.failed ? club : null);
const markSkip = (k, skip) => { if (skip) club.el(k).dataset.skip = "1"; else delete club.el(k).dataset.skip; };

function onKey(e) {
  const book = openBook();
  if (!book || $("dialog[open]") || e.altKey || e.ctrlKey || e.metaKey) return;
  if (/input|textarea|select/i.test(document.activeElement?.tagName || "")) return;
  if (e.key === "ArrowRight") { book.step(1); e.preventDefault(); }
  if (e.key === "ArrowLeft") { book.step(-1); e.preventDefault(); }
}

// =====================================================================
// ROUTING: the address bar holds the club, the chapter and the view
//   #team=147 · #team=147&page=october · #view=league · #view=league&page=climb
// =====================================================================
// True while the page is catching up with the address bar (first load, Back/Forward), so that
// catching up doesn't itself add history entries.
let quiet = true;
function hashFor() {
  const p = new URLSearchParams(), book = openBook();
  if (state.team) p.set("team", state.team.id);
  if (state.view === "league") p.set("view", "league");
  if (book?.pages.length && book.page !== book.pages[0]) p.set("page", book.page);
  return p.toString();
}
function syncURL() {
  const t = state.team;
  document.title = state.view === "league" ? `The League: ${league.label(league.page)} · ${SITE}`
    : t && club.pages.length ? `${t.name}: ${club.label(club.page)} · ${SITE}` : SITE;
  if (quiet) return;
  const hash = hashFor();
  if (hash === location.hash.slice(1)) return;
  try { history.pushState(null, "", hash ? "#" + hash : location.pathname + location.search); } catch {}
}
async function applyRoute() {
  quiet = true;
  try {
    const q = new URLSearchParams(location.hash.slice(1));
    const id = +q.get("team"), page = q.get("page"), inLeague = q.get("view") === "league";
    state.view = inLeague ? "league" : "franchise";
    if (inLeague) league.go(page, { scroll: false });
    if (teamById(id)) {
      if (state.team?.id !== id || !state.seasons.length) await selectTeam(id, inLeague ? "ledger" : page);
      else if (!inLeague) club.go(page, { scroll: false });
    } else closeClub();
    layout();
    syncURL();
  } finally { quiet = false; }
}

// Show the right parts of the page for the current view, club and load state.
function layout() {
  const fr = state.view === "franchise", open = !!state.team;
  $$(".tab").forEach((b) => { const on = b.dataset.view === state.view; b.classList.toggle("active", on); b.setAttribute("aria-pressed", String(on)); });
  $("#view-franchise").hidden = !fr;
  $("#view-league").hidden = fr;
  $("#front").hidden = open;
  $("#franchise").hidden = !open || state.failed;
  $("#notice").hidden = !state.failed;
  $("#rail").hidden = fr && !open;
  $$(".rail-btn").forEach((b) => b.classList.toggle("active", +b.dataset.club === state.team?.id));
  $("#rail .active")?.scrollIntoView({ block: "nearest", inline: "center" });
  openBook()?.refresh();
}
function showView(v) {
  state.view = v;
  layout();
  syncURL();
}
function closeClub() {
  Object.assign(state, { team: null, failed: false, seasons: [] });
  club.pages = [];
}
// Back to the front page: no club selected.
function goHome() {
  closeClub();
  showView("franchise");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function openClub(id, page = "ledger") {
  for (const d of $$("dialog[open]")) d.close();
  state.view = "franchise";
  if (state.team?.id === id && state.seasons.length) { layout(); club.go(page); }
  else selectTeam(id, page).then(() => window.scrollTo({ top: 0, behavior: "smooth" }));
}

// =====================================================================
// THE CLUB
// =====================================================================
async function selectTeam(id, page = "ledger") {
  const team = teamById(id);
  Object.assign(state, { team, failed: false, seasons: [], decade: null, pinned: null });
  club.pages = [];
  hofAll = false;
  document.documentElement.style.setProperty("--team", color(id));
  $("#club-logo").src = logo(id);
  $("#club-name").textContent = team.name;
  $("#club-sub").textContent = "Opening the record books…";
  $("#franchise").classList.add("loading");
  layout();

  let hit, pit, hist;
  try {
    await ensureBundle(id);
    [hit, pit, hist] = await Promise.all([
      get(`/teams/${id}/stats?stats=yearByYear&group=hitting&sportId=1`),
      get(`/teams/${id}/stats?stats=yearByYear&group=pitching&sportId=1`),
      get(`/teams/${id}/history`),
    ]);
  } catch (err) {
    console.error(err);
    if (state.team?.id === id) rainDelay(`Couldn't fetch the ${team.teamName} record books from the MLB Stats API.`, () => selectTeam(id, page));
    return;
  }
  if (state.team?.id !== id) return; // switched clubs mid-load

  state.archive = ((state.photos[id] || {}).archive || []).slice();
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
  state.pinned = defaultPin();

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
  club.setup();
  $("#franchise").classList.remove("loading");
  club.go(page, { scroll: false });
  renderSeasonCard();
}

// Something couldn't be fetched: say so, and offer another go.
function rainDelay(text, retry) {
  state.failed = true;
  $("#notice").innerHTML = `<p class="empty-big">Rain delay</p><p>${esc(text)}</p>${retry ? `<button class="btn">Try again</button>` : ""}`;
  if (retry) $("#notice .btn").onclick = retry;
  layout();
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
  $("#club-sub").textContent = `Est. ${S[0].year} · ${S.length} seasons of baseball` + (!formerly.length ? "" : formerly.length <= 2 ? ` · formerly the ${listify(formerly)}` : ` · ${word(formerly.length)} other names along the way`);
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
  if (!S.length || club.el("ledger").hidden || $("#franchise").hidden || $("#view-franchise").hidden) return;
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
  S.forEach((s, i) => (out += `<rect class="hit${i === state.pinned ? " pinned" : ""}" data-i="${i}" x="${i * bw}" y="0" width="${bw}" height="${bandsTop}"/>`));
  svg.innerHTML = out;
  svg.onclick = (e) => { const i = e.target.dataset?.i; if (i != null) pinSeason(+i); };

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
    if (e.pointerType === "touch") { tip.hidden = true; return; } // a tap pins the season card instead
    tip.style.left = Math.min(r.width - 110, Math.max(110, e.clientX - r.left)) + "px";
    tip.style.top = e.clientY - r.top + "px";
    tip.hidden = false;
  };
  svg.onpointerleave = () => (tip.hidden = true);
}

// ---------- the season card: one year, pinned under the ledger ----------
// Start on the most recent title; a club still waiting for one starts on its best full season.
function defaultPin() {
  const S = state.seasons;
  const champ = S.findLastIndex((s) => s.champ);
  if (champ >= 0) return champ;
  const full = S.filter((s) => s.w + s.l >= 100);
  return full.length ? S.indexOf(full.reduce((a, b) => (b.pct > a.pct ? b : a))) : S.length - 1;
}
function pinSeason(i) {
  if (!state.seasons[i]) return;
  state.pinned = i;
  $$("#timeline .hit").forEach((r) => r.classList.toggle("pinned", +r.dataset.i === i));
  renderSeasonCard();
}
// "4-3-1" (wins, losses, ties) from the winner's side -> "4–3–1", or "3–4–1" from the loser's
function seriesScore(c, won = true) {
  const [a, b, t] = (c.result || "").split("-");
  return (won ? `${a}–${b}` : `${b}–${a}`) + (t ? `–${t}` : "");
}
function renderSeasonCard() {
  const S = state.seasons, i = state.pinned, s = S[i], el = $("#season-card");
  if (!s) { el.innerHTML = ""; return; }
  const c = state.champions[s.year];
  const rank = S.filter((x) => x.pct > s.pct).length + 1;
  const park = state.parks.find((p) => p.from <= s.year && s.year <= p.to);
  const mgr = managersIn(s.year).map((m) => m.name);
  const greats = allLegendsIn(s.year).map((p) => p.name);
  const aw = awardsIn(s.year).map((a) => `${a.name} (${a.award})`);
  const photos = state.archive.filter((a) => a.year === s.year);
  const flag = s.champ ? `<p class="sc-flag champ">★ World Champions: beat the ${esc(c.loser.name)}, ${seriesScore(c)}</p>`
    : s.pennant ? `<p class="sc-flag">Pennant winners: lost the World Series to the ${esc(c.winner.name)}, ${seriesScore(c, false)}</p>` : "";
  const row = (k, v) => (v ? `<div><dt>${k}</dt><dd>${v}</dd></div>` : "");
  const line = [s.era && `${s.era} team ERA`, s.hr != null && `${num(s.hr)} home runs`, s.avg && `${s.avg} team average`].filter(Boolean).join(" · ");
  el.innerHTML = `
    <div class="sc-head">
      <button class="sc-nav" id="sc-prev" aria-label="Previous season"${i === 0 ? " disabled" : ""}>‹</button>
      <div class="sc-year"><b>${s.year}</b><span>${esc(s.name)}</span></div>
      <button class="sc-nav" id="sc-next" aria-label="Next season"${i === S.length - 1 ? " disabled" : ""}>›</button>
    </div>
    <div class="sc-body">
      <div class="sc-rec"><b>${s.w}–${s.l}</b><span>${fmtPct(s.pct)} · ${rank === 1 ? "the best" : nth(rank) + "-best"} record of ${S.length} seasons</span></div>
      ${flag}
      <dl class="sc-facts">
        ${row(mgr.length > 1 ? "Skippers" : "Skipper", esc(listify(mgr)))}
        ${row("Home field", park ? esc(park.name) : "")}
        ${row("Legends on the roster", esc(listify(greats)))}
        ${row("Hardware", esc(listify(aw)))}
        ${row("By the numbers", esc(line))}
      </dl>
    </div>
    ${photos.length ? `<div class="sc-photos">${photos.slice(0, 2).map((a) => `<button class="sc-photo" data-i="${state.archive.indexOf(a)}" title="${esc(a.title)}"><img src="${esc(a.src)}" alt="${esc(a.title)}" loading="lazy"></button>`).join("")}</div>` : ""}`;
  $("#sc-prev").onclick = () => { pinSeason(i - 1); $("#sc-prev").focus(); };
  $("#sc-next").onclick = () => { pinSeason(i + 1); $("#sc-next").focus(); };
  $$("#season-card .sc-photo").forEach((b) => (b.onclick = () => openLightbox(state.archive, +b.dataset.i)));
}

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => openBook()?.refresh(), 150);
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
// One World Series as the given club lived it: [{n, us, them, home, res, inn, park}, ...]
function seriesGames(c, tid) {
  return (c.games || []).map((g, i) => {
    const home = g.home === tid, us = home ? g.hs : g.as, them = home ? g.as : g.hs;
    return { n: i + 1, us, them, home, res: us > them ? "W" : us < them ? "L" : "T", inn: g.inn, park: g.park };
  });
}
const gameChips = (games) => games.map((g) => `<span class="oct-g ${g.res.toLowerCase()}" title="Game ${g.n}${g.park ? " at " + esc(g.park) : ""}${g.inn > 9 ? `, ${g.inn} innings` : ""}">`
  + `<small>G${g.n}${g.home ? "" : " @"}</small><b>${g.res}</b> ${g.us}–${g.them}${g.inn > 9 ? `<sup>${g.inn}</sup>` : ""}</span>`).join("");
const clinchLine = (g) => (g ? `Clinched in Game ${g.n}${g.park ? ` at ${esc(parkName(g.park))}` : ""}, ${g.us}–${g.them}${g.inn > 9 ? ` in ${g.inn} innings` : ""}.` : "");

function renderOctober() {
  const tid = state.team.id;
  const won = state.seasons.filter((s) => s.champ), lost = state.seasons.filter((s) => s.pennant && !s.champ);
  markSkip("october", !won.length && !lost.length);
  $("#october-lost-wrap").hidden = !lost.length;
  $("#oct-key").hidden = !won.length && !lost.length;
  if (!won.length) $("#october").innerHTML = "";
  if (!lost.length) $("#october-lost").innerHTML = "";
  if (!won.length && !lost.length) return;
  const trips = plural(lost.length, won.length ? "other trip" : "trip");
  $("#october-lede").textContent = !won.length ? `No championship yet, but ${trips} to the Fall Classic.`
    : (won.length === 1 ? `One World Series championship, in ${won[0].year}` : `${Word(won.length)} World Series championships, from ${won[0].year} to ${won.at(-1).year}`)
      + (lost.length ? `, and ${trips} to the Fall Classic.` : ".");

  // Titles, newest first, each told game by game.
  const photoFor = (y) => state.archive.find((a) => a.year === y && /world series/i.test(a.title)) || state.archive.find((a) => a.year === y);
  $("#october").innerHTML = won.slice().reverse().map((s) => {
    const c = state.champions[s.year], [a, b, t] = (c.result || "").split("-");
    const games = seriesGames(c, tid);
    const sweep = +b === 0 && !t;
    const runs = games.reduce((r, g) => [r[0] + g.us, r[1] + g.them], [0, 0]);
    const mgr = managersIn(s.year).map((m) => m.name);
    const stars = allLegendsIn(s.year).map((p) => p.name);
    const mvp = (c.mvp || []).filter((m) => m.team === tid).map((m) => m.name);
    const ph = photoFor(s.year);
    return `<article class="oct won">
      <div class="oct-year"><span>${s.year}</span><i>★</i></div>
      <div class="oct-body">
        <div class="oct-flag">${sweep ? `A ${WORDS[+a] ? WORDS[+a] + "-game " : ""}sweep` : +a + +b === 7 ? "Won in seven" : "World Champions"}</div>
        <h4>Beat the ${esc(c.loser.name)}, <span class="oct-score">${seriesScore(c)}</span></h4>
        ${games.length ? `<div class="oct-games">${gameChips(games)}</div>` : ""}
        <p>${clinchLine(games.at(-1))}${!games.length ? "" : runs[0] > runs[1] ? ` Outscored them ${runs[0]}–${runs[1]} over the series.`
          : runs[0] < runs[1] ? ` Won it despite being outscored ${runs[1]}–${runs[0]}.` : ` Runs were even over the series, ${runs[0]}–${runs[1]}.`}</p>
        <p>${esc(s.name)} · ${s.w}–${s.l} in the regular season${mgr.length ? ` · managed by ${esc(listify(mgr))}` : ""}</p>
        ${mvp.length ? `<p class="oct-mvp">World Series MVP: ${esc(listify(mvp))}</p>` : ""}
        ${stars.length ? `<p class="oct-stars">On the roster: ${esc(listify(stars))}</p>` : ""}
      </div>
      ${ph ? `<button class="oct-photo" data-i="${state.archive.indexOf(ph)}"><img src="${esc(ph.src)}" alt="${esc(ph.title)}" loading="lazy"></button>` : ""}
    </article>`;
  }).join("");
  $$("#october .oct-photo").forEach((b) => (b.onclick = () => openLightbox(state.archive, +b.dataset.i)));

  // Pennants that ended one step short: a line apiece.
  $("#october-lost").innerHTML = lost.slice().reverse().map((s) => {
    const c = state.champions[s.year], games = seriesGames(c, tid);
    return `<div class="oct-l">
      <b>${s.year}</b>
      <div><span class="oct-l-what">Lost to the ${esc(c.winner.name)}, <span class="oct-score">${seriesScore(c, false)}</span></span>
        <small>${esc(s.name)} · ${s.w}–${s.l}</small></div>
      <div class="oct-games">${gameChips(games)}</div>
    </div>`;
  }).join("");
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
      <div class="tcard-face" style="--tc:${color(state.team.id)}">
        <div class="tcard-art${photo ? "" : " headshot"}">
          <img src="${esc(photo ? photo.src : headshot(p.id, 360))}" alt="" loading="lazy"${photo?.pos ? ` style="object-position:${esc(photo.pos)}"` : ""}>
          <span class="tcard-rank">${i + 1}</span>
        </div>
        <div class="tcard-plate">${esc(p.name)}<small>${esc(p.pos || "")} · ${p.from}–${p.to}</small></div>
      </div>
      <div class="tcard-back">
        <h4>${esc(p.name)}</h4>
        ${p.nick ? `<div class="tcard-nick">“${esc(p.nick)}”</div>` : ""}
        <div class="tcard-meta">${plural(p.seasons, "season")} with the club${p.value ? ` · worth about ${Math.round(p.value)} wins` : ""}</div>
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
  const tc = color(state.team.id);
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
  const nh = state.nohitters.filter((g) => g.t === state.team.id), nhAgainst = state.nohitters.filter((g) => g.o === state.team.id);
  markSkip("trophies", !A.length && !nh.length && !nhAgainst.length);
  const html = groups.map(([key, label, fill]) => {
    const list = A.filter((a) => a.award === key);
    return `<div class="trophy-col"><h4>${TROPHY(fill)}${label}<small>${list.length}</small></h4>
      ${list.length ? `<ul class="trophy-list by-year">${list.map((a) => `<li><b>${a.season}</b><span>${esc(a.name)}</span></li>`).join("")}</ul>`
        : `<p class="trophy-empty">The shelf awaits its first.</p>`}</div>`;
  });
  // Gold Gloves (since 1957) and Silver Sluggers (since 1980) come by the dozen, so list them by player.
  const multi = [["Gold Glove", "Gold Gloves", "#e3b23c", "Fielding's top honor, since 1957"], ["Silver Slugger", "Silver Sluggers", "#b8bcc2", "The best bat at each position, since 1980"]];
  html.push(...multi.map(([key, label, fill, note]) => {
    const list = A.filter((a) => a.award === key), by = new Map();
    for (const a of list) by.set(a.id, [...(by.get(a.id) || []), a]);
    const rows = [...by.values()].sort((x, y) => y.length - x.length || x[0].season - y[0].season);
    return `<div class="trophy-col wide"><h4>${TROPHY(fill)}${label}<small>${list.length}</small></h4>
      <p class="trophy-note">${note}</p>
      ${rows.length ? `<ul class="trophy-list">${rows.map((r) => `<li><b>${r.length > 1 ? "×" + r.length : ""}</b><span>${esc(r[0].name)} <i>${esc(spans(r.map((a) => a.season)))}</i></span></li>`).join("")}</ul>`
        : `<p class="trophy-empty">The shelf awaits its first.</p>`}</div>`;
  }));
  if (state.nohitters.length) html.push(noHitShelves(nh, nhAgainst));
  $("#trophies").innerHTML = html.join("");
}

// ---------- no-hitters: the club's own, and the ones thrown at it ----------
const GAME_TYPE = { F: "Wild Card Series", D: "Division Series", L: "League Championship Series", W: "World Series" };
const GAME_TAG = { F: "Wild Card", D: "Division Series", L: "LCS", W: "World Series" };
const BALL = `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12.5" fill="#fbf7ee" stroke="#2a2118" stroke-width="1.2"/><path fill="none" stroke="#a3302a" stroke-width="1.3" stroke-dasharray="1.6 1.4" d="M8.2 6.6c3.6 2.6 5.2 5.8 5.2 9.4s-1.6 6.8-5.2 9.4M23.8 6.6c-3.6 2.6-5.2 5.8-5.2 9.4s1.6 6.8 5.2 9.4"/></svg>`;
const surname = (n) => n.replace(/,? (Jr\.|Sr\.|II|III|IV)$/, "").split(" ").at(-1);
const nhWho = (g) => (g.p.length === 1 ? g.p[0][0] : listify(g.p.map((p) => surname(p[0]))));
const nhLost = (g) => g.r[0] < g.r[1];
const longDate = (d, opts = {}) => new Date(d + "T12:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", ...opts });
function nhTags(g) {
  const tags = [];
  if (g.pg) tags.push(`<em class="perfect">Perfect</em>`);
  if (g.p.length > 1) tags.push(`<em>Combined</em>`);
  if (g.gt !== "R") tags.push(`<em class="october">${GAME_TAG[g.gt] || "Postseason"}</em>`);
  if (nhLost(g)) tags.push(`<em>Lost ${g.r[0]}–${g.r[1]}</em>`);
  return tags.join("");
}
function noHitShelves(thrown, against) {
  const perfect = thrown.filter((g) => g.pg).length;
  const row = (g, mine) => `<li><button class="nh-row${g.pg ? " pg" : ""}" data-game="${g.pk}">
      <b>${g.d.slice(0, 4)}</b>
      <span class="nh-who">${esc(nhWho(g))}${mine ? "" : ` <small>${esc(g.tn)}</small>`}
        <i>${mine ? `${g.r[0]}–${g.r[1]} ${g.home ? "vs." : "at"} ${esc(g.on)}` : longDate(g.d, { year: undefined })}</i>
        ${mine ? "" : `<span class="nh-tags">${nhTags(g)}</span>`}</span>
      ${mine ? `<span class="nh-tags">${nhTags(g)}</span>` : ""}</button></li>`;
  const note = thrown.length
    ? `${Word(thrown.length)} since 1901${perfect ? `, ${perfect === thrown.length ? "every one" : word(perfect)} of them perfect` : ""}. Pick one for its line score.`
    : "None yet since 1901.";
  return `<div class="trophy-col nohit"><h4>${BALL}No-Hitters<small>${thrown.length}</small></h4>
      <p class="trophy-note">${note}</p>
      ${thrown.length ? `<ul class="trophy-list nh-list">${thrown.map((g) => row(g, true)).join("")}</ul>` : `<p class="trophy-empty">The shelf awaits its first.</p>`}
    </div>
    <div class="trophy-col nohit against"><h4>${BALL}No-Hit By<small>${against.length}</small></h4>
      <p class="trophy-note">The other side of the ledger: nights this club never got a hit.</p>
      ${against.length ? `<ul class="trophy-list nh-list">${against.map((g) => row(g, false)).join("")}</ul>` : `<p class="trophy-empty">Never once, since 1901.</p>`}
    </div>`;
}

// A no-hitter's scorecard: the line score (fetched live; every game since 1901 has one) and the pitching line.
let gameAsk = 0;
async function openGame(pk) {
  const g = state.nohitters.find((x) => x.pk === pk);
  if (!g) return;
  const ask = ++gameAsk;
  const nohit = { id: g.t, name: g.tn }, victim = { id: g.o, name: g.on };
  const [away, home] = g.home ? [victim, nohit] : [nohit, victim];
  const club = (x) => (teamById(x.id) ? `<button class="btn btn-small" data-club="${x.id}" data-page="trophies">The ${esc(teamById(x.id).teamName)} almanac</button>` : "");
  const kind = g.pg ? "A perfect game" : g.p.length > 1 ? "A combined no-hitter" : "A no-hitter";
  const story = [
    g.gt !== "R" ? `Thrown in the ${GAME_TYPE[g.gt] || "postseason"}.` : "",
    nhLost(g) ? `No hits allowed, and lost all the same, ${g.r[1]}–${g.r[0]}.` : "",
    g.p.length > 1 ? `${Word(g.p.length)} pitchers shared it.` : "",
  ].filter(Boolean).join(" ");
  $("#series-body").innerHTML = `
    <span class="kicker">${kind} · ${longDate(g.d, { weekday: "long" })}</span>
    <div class="series-clubs" style="--pc:${color(g.t)}">
      <img src="${logo(g.t)}" alt=""><b>${g.r[0]}–${g.r[1]}</b><img class="lost" src="${logo(g.o)}" alt="">
    </div>
    <h3>${esc(nhWho(g))}</h3>
    <p>${esc(g.tn)} ${g.home ? "vs." : "at"} ${esc(g.on)}${story ? `. ${story}` : "."}</p>
    <div class="linescore" id="linescore"><p class="ls-wait">Fetching the line score…</p></div>
    <div class="ls-arms">${g.p.map(([name, id, ip]) => `<figure><img src="${headshot(id, 96)}" alt="" loading="lazy"><figcaption>${esc(name)}<small data-arm="${id}">${ip} IP</small></figcaption></figure>`).join("")}</div>
    <div class="series-links">${club(nohit)}${club(victim)}</div>`;
  $("#series").showModal();
  try {
    const [ls, box] = await Promise.all([get(`/game/${pk}/linescore`), get(`/game/${pk}/boxscore`).catch(() => null)]);
    if (ask !== gameAsk) return;
    const inn = ls.innings || [];
    const cell = (v) => (v === undefined || v === null ? "x" : v);
    const line = (side, team) => {
      const T = ls.teams?.[side] || {};
      const zero = team.id === g.o ? " zero" : "";
      const abbr = box?.teams?.[side]?.team?.abbreviation || teamById(team.id)?.abbreviation || team.name; // the club's letters that day
      return `<tr><th title="${esc(team.name)}">${esc(abbr)}</th>${inn.map((i) => `<td>${cell(i[side]?.runs)}</td>`).join("")}
        <td class="tot">${T.runs ?? ""}</td><td class="tot${zero}">${T.hits ?? ""}</td><td class="tot">${T.errors ?? ""}</td></tr>`;
    };
    $("#linescore").innerHTML = inn.length ? `<table><thead><tr><th></th>${inn.map((i) => `<th>${i.num}</th>`).join("")}<th>R</th><th>H</th><th>E</th></tr></thead>
      <tbody>${line("away", away)}${line("home", home)}</tbody></table>` : "";
    // Strikeouts and walks for each pitcher, where the box score keeps them.
    const side = box?.teams?.[g.home ? "home" : "away"];
    for (const [, id, ip] of g.p) {
      const s = side?.players?.[`ID${id}`]?.stats?.pitching;
      const el = $(`#series-body [data-arm="${id}"]`);
      if (s && el) el.textContent = [`${ip} IP`, s.strikeOuts != null && `${s.strikeOuts} K`, s.baseOnBalls != null && `${s.baseOnBalls} BB`].filter(Boolean).join(" · ");
    }
  } catch {
    if (ask === gameAsk) $("#linescore").innerHTML = "";
  }
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
// a click on the backdrop closes a dialog
for (const d of $$("dialog")) d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
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
  $("#lb-club").hidden = !a.team;
  if (a.team) { $("#lb-club").dataset.club = a.team.id; $("#lb-club").textContent = `Open the ${a.team.teamName} scrapbook`; }
  const many = LB.list.length > 1;
  $("#lb-prev").hidden = $("#lb-next").hidden = !many;
  $("#lb-count").textContent = many ? `${i + 1} of ${LB.list.length}` : "";
}

// =====================================================================
// LEAGUE
// =====================================================================
const HONORS = [["titles", "Titles"], ["pennants", "Pennants"], ["hof", "Hall of Famers"], ["retired", "Retired Nos."], ["mvp", "MVPs"], ["cy", "Cy Youngs"], ["roy", "Rookies of the Year"]];
function renderLeague() {
  const C = state.champions, years = Object.keys(C).map(Number).sort((a, b) => a - b);
  const thisYear = Math.max(...years, new Date().getFullYear() - 1);
  const rows = state.teams.map((t) => {
    const won = years.filter((y) => C[y].winner.id === t.id), last = won.at(-1);
    const start = Math.max(1903, +t.firstYearOfPlay || 1903);
    return { t, titles: won.length, last, drought: last ? thisYear - last : thisYear - start + 1, never: !last };
  }).sort((a, b) => b.drought - a.drought);
  const max = rows[0].drought;
  $("#droughts").innerHTML = rows.map((r) => `
    <button class="brow" data-club="${r.t.id}">
      <img src="${logo(r.t.id)}" alt="" loading="lazy">
      <span class="bname">${esc(r.t.teamName)} <small>· ${plural(r.titles, "title")}</small></span>
      <span class="bbar-wrap"><span class="bbar" style="width:${(r.drought / max) * 100}%"></span></span>
      <span class="bval"><b>${r.drought}</b>${r.never ? "never" : "since " + r.last}</span>
    </button>`).join("");

  const wall = [];
  for (let y = thisYear; y >= 1903; y--) {
    const c = C[y];
    if (!c) { wall.push(`<div class="wpen gap" title="No World Series">${y}<br>no series</div>`); continue; }
    wall.push(`<button class="wpen" data-year="${y}" style="--pc:${color(c.winner.id)}" title="${y}: ${esc(c.winner.name)} def. ${esc(c.loser.name)} (${seriesScore(c)})">
      <img src="${logo(c.winner.id)}" alt="${esc(c.winner.name)}" loading="lazy"><span>${y}</span></button>`);
  }
  $("#wall").innerHTML = wall.join("");
  $("#wall").onclick = (e) => { const b = e.target.closest("[data-year]"); if (b) openSeries(+b.dataset.year); };
  $("#series-close").onclick = () => $("#series").close();
  renderHonors();
  if (state.nohitters.length) { delete league.el("nohitters").dataset.skip; renderNoHitLedger(); }
  else league.el("nohitters").dataset.skip = "1";

  // The record-book chapters need data/league.json; without it they are left out.
  const clubs = leagueClubs();
  for (const k of ["standings", "climb", "decades", "banner"]) { if (clubs.length) delete league.el(k).dataset.skip; else league.el(k).dataset.skip = "1"; }
  if (!clubs.length) return;
  renderStandings();
  setupClimb();
  renderDecades();
  renderBanner();
}

// ---------- the record books: every club's every season ----------
// [{ t, seasons: [{y, w, l, cum}], W, L, p }] where cum is games over .500 through that season
let leagueMemo = null;
function leagueClubs() {
  return (leagueMemo ||= state.teams.map((t) => {
    let cum = 0;
    const seasons = (state.records[t.id] || []).map(([y, w, l]) => ({ y, w, l, cum: (cum += w - l) }));
    const W = seasons.reduce((a, s) => a + s.w, 0), L = seasons.reduce((a, s) => a + s.l, 0);
    return { t, seasons, W, L, p: pct(W, L) };
  }).filter((c) => c.seasons.length));
}
const signed = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + num(Math.abs(n));
const latestSeason = () => Math.max(...leagueClubs().map((c) => c.seasons.at(-1).y));
const isChamp = (id, y) => state.champions[y]?.winner.id === id;

// ---------- all-time standings ----------
function renderStandings() {
  const last = latestSeason(), first = Math.min(...leagueClubs().map((c) => c.seasons[0].y));
  const ranges = [[0, "All time"], [1969, "Since 1969"], [2000, "Since 2000"], [last - 9, "Last ten seasons"]];
  $("#st-range").innerHTML = ranges.map(([y, label]) => `<button data-y="${y}" class="${state.since === y ? "on" : ""}" aria-pressed="${state.since === y}">${label}</button>`).join("");
  $$("#st-range button").forEach((b) => (b.onclick = () => { state.since = +b.dataset.y; renderStandings(); $(`#st-range button[data-y="${state.since}"]`).focus(); }));
  const rows = leagueClubs().map((c) => {
    const S = c.seasons.filter((s) => s.y >= state.since);
    const W = S.reduce((a, s) => a + s.w, 0), L = S.reduce((a, s) => a + s.l, 0);
    return { t: c.t, from: S[0]?.y, n: S.length, W, L, p: pct(W, L) };
  }).filter((r) => r.n).sort((a, b) => b.p - a.p);
  const maxDev = Math.max(0.03, ...rows.map((r) => Math.abs(r.p - 0.5)));
  $("#standings").innerHTML = `<div class="st-head"><span></span><span></span><span>Club</span><span class="st-axis"><i>${fmtPct(0.5 - maxDev)}</i><i>.500</i><i>${fmtPct(0.5 + maxDev)}</i></span><span>Pct.</span><span>Won–Lost</span><span>± .500</span></div>` +
    rows.map((r, i) => `
    <button class="strow" data-club="${r.t.id}" title="${esc(r.t.name)}: ${num(r.W)}–${num(r.L)}, ${fmtPct(r.p)}">
      <span class="st-rank">${i + 1}</span>
      <img src="${logo(r.t.id)}" alt="" loading="lazy">
      <span class="st-name">${esc(r.t.teamName)} <small>${plural(r.n, "season")}</small></span>
      <span class="st-bar"><i class="${r.p >= 0.5 ? "up" : "down"}" style="width:${(Math.abs(r.p - 0.5) / maxDev) * 50}%"></i></span>
      <span class="st-pct">${fmtPct(r.p)}</span>
      <span class="st-rec">${num(r.W)}–${num(r.L)}</span>
      <span class="st-diff">${signed(r.W - r.L)}</span>
    </button>`).join("");
  const winners = rows.filter((r) => r.p > 0.5).length;
  $("#standings-note").textContent = `Counting ${Math.max(first, state.since)}–${last}. ${Word(winners)} of ${rows.length} clubs are over .500 for the stretch.`;
}

// ---------- the long climb: cumulative games over .500 ----------
function setupClimb() {
  const C = leagueClubs();
  const byEnd = [...C].sort((a, b) => b.seasons.at(-1).cum - a.seasons.at(-1).cum);
  const leaders = () => new Set([...byEnd.slice(0, 2), ...byEnd.slice(-2)].map((c) => c.t.id));
  state.climbPins ||= leaders();
  $("#climb-clubs").innerHTML = C.map((c) => `<button class="rail-btn" data-pick="${c.t.id}" title="${esc(c.t.name)}" aria-label="${esc(c.t.name)}" aria-pressed="false" style="--tc:${color(c.t.id)}"><img alt="" src="${logo(c.t.id)}" loading="lazy"></button>`).join("");
  $("#climb-clubs").onclick = (e) => { const b = e.target.closest("[data-pick]"); if (b) toggleClimbPin(+b.dataset.pick); };
  $("#climb-reset").onclick = () => { state.climbPins = leaders(); renderClimb(); };
}
function toggleClimbPin(id) {
  if (!state.climbPins.delete(id)) state.climbPins.add(id);
  renderClimb();
}
function renderClimb() {
  const svg = $("#climb"), C = leagueClubs();
  if (!C.length || !state.climbPins || league.el("climb").hidden || $("#view-league").hidden) return;
  const W = Math.max(300, Math.round(svg.clientWidth)), H = Math.round(svg.clientHeight || 440), small = W < 560;
  const m = { l: 46, r: small ? 112 : 118, t: 12, b: 24 };
  const y0 = Math.min(...C.map((c) => c.seasons[0].y)), y1 = latestSeason();
  const all = C.flatMap((c) => c.seasons.map((s) => s.cum));
  const tick = Math.max(...all) - Math.min(...all) > 2400 ? 500 : 250;
  const lo = Math.floor(Math.min(...all, 0) / tick) * tick, hi = Math.ceil(Math.max(...all, 0) / tick) * tick;
  const x = (yr) => m.l + ((yr - y0) / (y1 - y0)) * (W - m.l - m.r);
  const y = (v) => m.t + ((hi - v) / (hi - lo)) * (H - m.t - m.b);
  const pins = state.climbPins;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

  let out = "";
  for (let v = lo; v <= hi; v += tick) {
    out += `<line class="${v === 0 ? "zero" : "grid"}" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${v === 0 ? ".500" : signed(v)}</text>`;
  }
  for (let yr = Math.ceil(y0 / 20) * 20; yr <= y1; yr += small ? 40 : 20) out += `<text class="tick" x="${x(yr)}" y="${H - 6}" text-anchor="middle">${yr}</text>`;
  const path = (c) => c.seasons.map((s, i) => `${i ? "L" : "M"}${x(s.y).toFixed(1)} ${y(s.cum).toFixed(1)}`).join("");
  // everyone in the background, the pinned clubs on top in their own colors
  for (const c of C) if (!pins.has(c.t.id)) out += `<path class="cl" data-id="${c.t.id}" d="${path(c)}"/>`;
  const lit = C.filter((c) => pins.has(c.t.id)).sort((a, b) => b.seasons.at(-1).cum - a.seasons.at(-1).cum);
  for (const c of lit) out += `<path class="cl on" data-id="${c.t.id}" d="${path(c)}" style="stroke:${color(c.t.id)}"/>`;
  // end labels, nudged apart so they never sit on top of each other
  let floor = -Infinity;
  for (const c of lit) {
    const end = c.seasons.at(-1), ly = Math.max(y(end.cum) + 4, floor + 13);
    floor = ly;
    out += `<circle cx="${x(end.y)}" cy="${y(end.cum)}" r="3.5" fill="${color(c.t.id)}" stroke="var(--card)" stroke-width="1.5"/>` +
      `<text class="end" x="${x(end.y) + 8}" y="${ly}"><tspan class="end-name">${esc(c.t.teamName)}</tspan> ${signed(end.cum)}</text>`;
  }
  out += `<circle id="climb-dot" r="4.5" hidden/>`;
  svg.innerHTML = out;
  $$("#climb-clubs [data-pick]").forEach((b) => b.setAttribute("aria-pressed", String(pins.has(+b.dataset.pick))));

  // hover: the line nearest the pointer, in that season
  const tip = $("#climb-tip"), wrap = $(".climb-wrap"), dot = $("#climb-dot");
  let hot = null;
  const clear = () => { tip.hidden = true; dot.setAttribute("hidden", ""); $(".cl.hot", svg)?.classList.remove("hot"); hot = null; };
  svg.onpointermove = (e) => {
    const r = svg.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    const yr = Math.round(y0 + ((px - m.l) / (W - m.l - m.r)) * (y1 - y0));
    let best = null;
    for (const c of C) {
      const s = c.seasons.find((q) => q.y === yr);
      if (!s) continue;
      const d = Math.abs(y(s.cum) - py);
      if (d < 28 && (!best || d < best.d)) best = { c, s, d };
    }
    if (!best) return clear();
    if (hot !== best.c.t.id) {
      $(".cl.hot", svg)?.classList.remove("hot");
      $(`.cl[data-id="${best.c.t.id}"]`, svg).classList.add("hot");
      hot = best.c.t.id;
    }
    dot.removeAttribute("hidden");
    dot.setAttribute("cx", x(best.s.y)); dot.setAttribute("cy", y(best.s.cum));
    tip.innerHTML = `<b>${esc(best.c.t.teamName)}</b> through ${best.s.y}<br>${best.s.cum === 0 ? "Dead even at .500" : `${num(Math.abs(best.s.cum))} games ${best.s.cum > 0 ? "over" : "under"} .500`}` +
      `<br><span class="muted">${best.s.y}: ${best.s.w}–${best.s.l}${isChamp(best.c.t.id, best.s.y) ? " · ★ World Champions" : ""}</span>`;
    tip.style.left = Math.min(r.width - 110, Math.max(110, x(best.s.y))) + "px";
    tip.style.top = y(best.s.cum) - 6 + "px";
    tip.hidden = false;
  };
  svg.onpointerleave = clear;
  svg.onclick = () => { if (hot != null) toggleClimbPin(hot); };
}

// ---------- decade by decade: a heatmap of winning percentage ----------
const DEC_SPAN = 0.12; // the color scale runs from .380 to .620
function decColor(p) {
  const dev = p - 0.5, t = Math.min(1, Math.abs(dev) / DEC_SPAN);
  if (t < 0.06) return { bg: "var(--dec-mid)", dark: false };
  const mix = Math.round(14 + t * 86);
  return { bg: `color-mix(in srgb, var(${dev > 0 ? "--dec-up" : "--dec-down"}) ${mix}%, var(--dec-mid))`, dark: mix > 52 };
}
function renderDecades() {
  const C = [...leagueClubs()].sort((a, b) => b.p - a.p);
  const first = Math.floor(Math.min(...C.map((c) => c.seasons[0].y)) / 10) * 10, decades = [];
  for (let d = first; d <= latestSeason(); d += 10) decades.push(d);
  const head = (d, i) => (i === 0 || d % 100 === 0 ? d : "’" + String(d).slice(2));
  const cell = (c, d) => {
    const S = c.seasons.filter((s) => s.y >= d && s.y < d + 10);
    if (!S.length) return `<span class="dc dc-out" role="cell"></span>`;
    const W = S.reduce((a, s) => a + s.w, 0), L = S.reduce((a, s) => a + s.l, 0), p = pct(W, L);
    const titles = S.filter((s) => isChamp(c.t.id, s.y)).length, k = decColor(p);
    const what = `${c.t.teamName}, ${yrs(S[0].y, S.at(-1).y)}: ${num(W)}–${num(L)} (${fmtPct(p)})${titles ? `, ${plural(titles, "title")}` : ""}`;
    return `<span class="dc${k.dark ? " dark" : ""}" role="cell" style="background:${k.bg}" data-tip="${esc(what)}" aria-label="${esc(what)}">${titles ? `★${titles > 1 ? `<small>${titles}</small>` : ""}` : ""}</span>`;
  };
  const grid = $("#decades-grid");
  grid.style.setProperty("--cols", decades.length);
  grid.innerHTML = `<div class="dec-row dec-head" role="row"><span role="columnheader"></span>${decades.map((d, i) => `<span class="dec-y" role="columnheader">${head(d, i)}</span>`).join("")}<span class="dec-tot" role="columnheader">All</span></div>` +
    C.map((c) => `<div class="dec-row" role="row">
      <button class="dec-name" role="rowheader" data-club="${c.t.id}" title="${esc(c.t.name)}"><img src="${logo(c.t.id)}" alt="" loading="lazy"><span>${esc(c.t.teamName)}</span></button>
      ${decades.map((d) => cell(c, d)).join("")}<span class="dec-tot" role="cell">${fmtPct(c.p)}</span></div>`).join("");
  const steps = [-0.12, -0.08, -0.04, 0, 0.04, 0.08, 0.12];
  $("#dec-key").innerHTML = `<span class="mk-k">Winning percentage in the decade</span>` +
    steps.map((d, i) => `<span class="mk"><i class="dc" style="background:${decColor(0.5 + d).bg}"></i>${i === 0 ? "≤ " : i === steps.length - 1 ? "≥ " : ""}${fmtPct(0.5 + d)}</span>`).join("") +
    `<span class="mk">★ World Series won</span>`;
  const tip = $("#dec-tip"), wrap = $(".dec-wrap");
  grid.onpointerover = (e) => {
    const c = e.target.closest(".dc[data-tip]");
    if (!c) { tip.hidden = true; return; }
    const r = c.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
    const [who, rest] = c.dataset.tip.split(": ");
    tip.innerHTML = `<b>${esc(who)}</b><br>${esc(rest)}`;
    tip.style.left = `${Math.min(wr.width - 120, Math.max(120, r.left - wr.left + r.width / 2))}px`;
    tip.style.top = `${r.top - wr.top}px`;
    tip.hidden = false;
  };
  grid.onpointerleave = () => (tip.hidden = true);
}

// ---------- banner years: the best and worst single seasons ----------
// ---------- the no-hit ledger: a block for every no-hitter, then each club's thrown vs. suffered ----------
function renderNoHitLedger() {
  const N = state.nohitters, first = 1901;
  const last = Math.max(new Date().getFullYear() - (new Date().getMonth() < 3 ? 1 : 0), ...N.map((g) => +g.d.slice(0, 4)));
  const byYear = new Map();
  for (const g of N) { const y = +g.d.slice(0, 4); byYear.set(y, [...(byYear.get(y) || []), g]); }
  const most = Math.max(...[...byYear.values()].map((a) => a.length));
  const busiest = [...byYear].filter(([, a]) => a.length === most).map(([y]) => y);
  const perfect = N.filter((g) => g.pg).length;
  const quiet = range(first, last).filter((y) => !byYear.has(y)).length;
  $("#nh-lede").textContent = `${num(N.length)} no-hitters since ${first}, ${perfect} of them perfect. ` +
    `The busiest ${busiest.length > 1 ? `seasons were ${listify(busiest.map(String))}, with ${most} apiece` : `season was ${busiest[0]}, with ${most}`}; ${quiet} seasons had none at all.`;
  const label = (g) => `${nhWho(g)}, ${g.tn}: ${g.r[0]}–${g.r[1]} ${g.home ? "vs." : "at"} ${g.on}, ${longDate(g.d)}${g.pg ? " (perfect game)" : ""}`;
  $("#nh-years").style.setProperty("--rows", most);
  $("#nh-years").innerHTML = range(first, last).map((y) => {
    const games = byYear.get(y) || [];
    return `<div class="nh-year${y % 10 === 0 ? " tick" : ""}" data-y="${y}">${games.map((g) =>
      `<button class="nh-unit${g.pg ? " pg" : ""}" data-game="${g.pk}" aria-label="${esc(label(g))}"></button>`).join("")}
      ${y % 20 === 0 || y === first ? `<span class="nh-yl">${y}</span>` : ""}</div>`;
  }).join("");
  const tip = $("#nh-tip"), wrap = $(".nh-wrap"), years = $("#nh-years");
  years.onpointermove = (e) => {
    const col = e.target.closest(".nh-year");
    if (!col) { tip.hidden = true; return; }
    const y = +col.dataset.y, games = byYear.get(y) || [], hot = e.target.closest(".nh-unit")?.dataset.game;
    tip.innerHTML = `<b>${y}</b> · ${games.length ? plural(games.length, "no-hitter") : "no no-hitters"}` +
      games.map((g) => `<br><span class="${String(g.pk) === hot ? "hot" : ""}">${g.pg ? "★ " : ""}${esc(nhWho(g))} <small>(${esc(teamById(g.t)?.teamName || g.tn)})</small></span>`).join("");
    const wr = wrap.getBoundingClientRect(), r = col.getBoundingClientRect();
    tip.style.left = `${Math.min(wr.width - 110, Math.max(110, r.left - wr.left + r.width / 2))}px`;
    const top = col.querySelector(".nh-unit:last-of-type"); // column-reverse: the last block sits highest
    tip.style.top = `${(top ? top.getBoundingClientRect().top : r.bottom) - wr.top - 4}px`;
    tip.hidden = false;
  };
  years.onpointerleave = () => (tip.hidden = true);

  // Thrown vs. suffered, a club per row: thrown runs right in blue, suffered left in red.
  const rows = state.teams.map((t) => ({ t, by: N.filter((g) => g.t === t.id), vs: N.filter((g) => g.o === t.id) }))
    .sort((a, b) => b.by.length - b.vs.length - (a.by.length - a.vs.length) || b.by.length - a.by.length);
  const max = Math.max(...rows.map((r) => Math.max(r.by.length, r.vs.length)));
  $("#nh-ledger").innerHTML = `<div class="nhl-head"><span></span><span>Club</span><span class="nhl-l">No-hit by others</span><span class="nhl-r">Thrown</span><span>Net</span></div>` +
    rows.map((r) => `<button class="nhl-row" data-club="${r.t.id}" data-page="trophies" title="${esc(r.t.name)}: threw ${r.by.length}, no-hit ${plural(r.vs.length, "time")}">
      <img src="${logo(r.t.id)}" alt="" loading="lazy">
      <span class="nhl-name">${esc(r.t.teamName)}</span>
      <span class="nhl-bar nhl-l"><i style="width:${(r.vs.length / max) * 100}%"></i><b>${r.vs.length}</b></span>
      <span class="nhl-bar nhl-r"><i style="width:${(r.by.length / max) * 100}%"></i><b>${r.by.length}</b></span>
      <span class="nhl-net">${signed(r.by.length - r.vs.length)}</span>
    </button>`).join("");
}

function renderBanner() {
  const all = leagueClubs().flatMap((c) => c.seasons.filter((s) => s.y >= 1901 && s.w + s.l >= 100).map((s) => ({ ...s, t: c.t, p: pct(s.w, s.l) })));
  const list = (rows, cls) => rows.map((s, i) => `
    <button class="strow" data-club="${s.t.id}" title="Open the ${esc(s.t.teamName)} almanac">
      <span class="st-rank">${i + 1}</span>
      <img src="${logo(s.t.id)}" alt="" loading="lazy">
      <span class="st-name">${s.y} ${esc(s.t.teamName)}${isChamp(s.t.id, s.y) ? ` <b class="st-star" title="World Champions">★</b>` : ""}</span>
      <span class="st-bar whole"><i class="${cls}" style="width:${s.p * 100}%"></i></span>
      <span class="st-rec">${s.w}–${s.l}</span>
      <span class="st-pct">${fmtPct(s.p)}</span>
    </button>`).join("");
  all.sort((a, b) => b.p - a.p);
  $("#best-seasons").innerHTML = list(all.slice(0, 15), "up");
  $("#worst-seasons").innerHTML = list(all.slice(-15).reverse(), "down");
}

// One World Series, told from the winner's side, in a dialog.
function openSeries(year) {
  const c = state.champions[year];
  if (!c) return;
  const games = seriesGames(c, c.winner.id);
  const mvp = (c.mvp || []).map((m) => m.name);
  const club = (x, page) => (teamById(x.id) ? `<button class="btn btn-small" data-club="${x.id}" data-page="${page}">The ${esc(teamById(x.id).teamName)} almanac</button>` : "");
  $("#series-body").innerHTML = `
    <span class="kicker">The ${year} World Series</span>
    <div class="series-clubs" style="--pc:${color(c.winner.id)}">
      <img src="${logo(c.winner.id)}" alt=""><b>${seriesScore(c)}</b><img class="lost" src="${logo(c.loser.id)}" alt="">
    </div>
    <h3>${esc(c.winner.name)} over the ${esc(c.loser.name)}</h3>
    ${games.length ? `<div class="oct-games">${gameChips(games)}</div><p>${clinchLine(games.at(-1))}</p>` : ""}
    ${mvp.length ? `<p class="oct-mvp">World Series MVP: ${esc(listify(mvp))}</p>` : ""}
    <div class="series-links">${club(c.winner, "october")}${club(c.loser, "october")}</div>`;
  $("#series").showModal();
}

// Thirty clubs side by side: sortable by any column.
function renderHonors() {
  const C = Object.values(state.champions);
  const count = (id, award) => ((state.history[id] || {}).awards || []).filter((a) => a.award === award).length;
  const rows = state.teams.map((t) => ({
    t, name: t.teamName, est: +t.firstYearOfPlay || 0,
    titles: C.filter((c) => c.winner.id === t.id).length,
    pennants: C.filter((c) => c.winner.id === t.id || c.loser.id === t.id).length,
    hof: ((state.history[t.id] || {}).hof || []).length,
    retired: (state.retired[t.id] || []).length,
    mvp: count(t.id, "MVP"), cy: count(t.id, "Cy Young"), roy: count(t.id, "Rookie of the Year"),
  }));
  const { key, dir } = state.honorSort;
  rows.sort((a, b) => (typeof a[key] === "string" ? a[key].localeCompare(b[key]) : a[key] - b[key]) * dir || b.titles - a.titles || a.name.localeCompare(b.name));
  const best = Object.fromEntries(HONORS.map(([k]) => [k, Math.max(...rows.map((r) => r[k]))]));
  const th = (k, label, cls = "") => `<th class="${cls}" aria-sort="${key === k ? (dir > 0 ? "ascending" : "descending") : "none"}"><button data-k="${k}">${label}${key === k ? `<i>${dir > 0 ? "▲" : "▼"}</i>` : ""}</button></th>`;
  $("#honors").innerHTML = `<thead><tr>${th("name", "Club", "hclub")}${th("est", "Est.")}${HONORS.map(([k, l]) => th(k, l)).join("")}</tr></thead><tbody>` +
    rows.map((r) => `<tr data-club="${r.t.id}"><th class="hclub" scope="row"><img src="${logo(r.t.id)}" alt="" loading="lazy">${esc(r.name)}</th><td>${r.est || ""}</td>` +
      HONORS.map(([k]) => `<td class="${k === key ? "sorted" : ""}${r[k] && r[k] === best[k] ? " best" : ""}">${r[k] || "<span>–</span>"}</td>`).join("") + `</tr>`).join("") + `</tbody>`;
  $("#honors thead").onclick = (e) => {
    const b = e.target.closest("button[data-k]");
    if (!b) return;
    const k = b.dataset.k, text = k === "name";
    state.honorSort = { key: k, dir: state.honorSort.key === k ? -state.honorSort.dir : text || k === "est" ? 1 : -1 };
    renderHonors();
    $(`#honors button[data-k="${k}"]`).focus();
  };
}

init().catch((err) => {
  console.error(err);
  rainDelay("Couldn't reach the MLB Stats API, so the almanac can't open just now.", () => location.reload());
});
