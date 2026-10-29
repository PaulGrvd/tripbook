/* Tripbook — carnet de voyage PWA. Vanilla JS, aucun framework. */
(() => {
"use strict";

// ---------- état ----------
const S = { data: null, token: "", me: null, route: { view: "today" }, ideaFilter: "all", showDone: false, showPast: false, es: null, status: "sync", queue: [], theme: "auto", map: { place: "", day: "", sheet: "open" } };
const ASSET_Q = (document.currentScript && document.currentScript.src.split("?")[1]) || ""; // « v=9 » : même version pour les fichiers chargés à la demande
const $ = (sel, el = document) => el.querySelector(sel);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const MONTHS = ["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
const DAYS = ["dim.","lun.","mar.","mer.","jeu.","ven.","sam."];
const DAYS_LONG = ["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"];
const parseISO = d => { const [y,m,dd] = String(d).split("-").map(Number); return new Date(y, m-1, dd); };
const fmtDay = d => { const x = parseISO(d); return `${x.getDate()} ${MONTHS[x.getMonth()]}`; };
const fmtDow = d => DAYS[parseISO(d).getDay()];
const iso = t => `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`;
const todayISO = () => iso(new Date());
// devises : trip.currency = devise maison (budget, prix), trip.localCurrency = devise du pays ("" = une seule devise), budget.rate = unités locales pour 1 unité maison
const homeCur = () => S.data?.trip?.currency || "EUR";
const localCur = () => S.data?.trip?.localCurrency || "";
const fmtCur = (n, cur) => {
  if (n == null || n === "" || isNaN(+n)) return "—";
  try { return new Intl.NumberFormat("fr-FR", { style: "currency", currency: cur, maximumFractionDigits: Number.isInteger(+n) ? 0 : 2 }).format(+n); }
  catch (_) { return `${(+n).toLocaleString("fr-FR")} ${cur}`; }
};
const money = n => fmtCur(n, homeCur());
const local = n => fmtCur(n, localCur());
const curSym = cur => fmtCur(0, cur).replace(/[\d\s\u00a0.,]/g, "") || cur;
const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
const booking = id => (S.data?.bookings || []).find(b => b.id === id);
const fmtWhen = s => s ? new Date(s).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
const cityKey = c => String(c || "").replace(/\s*#\d+$/, "").trim().toLowerCase();
const phase = () => { const t = todayISO(); return !S.data ? "before" : t < S.data.trip.start ? "before" : t > S.data.trip.end ? "after" : "during"; };
const inTrip = () => phase() === "during";
const rate = () => +(S.data?.budget?.rate) || +(S.data?.budget?.jpyPerEur) || 1;
const isLocal = e => !!localCur() && e.currency === localCur();
const toHome = e => isLocal(e) ? (+e.amount || 0) / rate() : (+e.amount || 0);
const fmtExp = e => isLocal(e) ? local(e.amount) : money(e.amount);
const fileUrl = n => withToken("files/" + encodeURIComponent(n));
const mapsUrl = b => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((b.name || "") + " " + (b.address || ""))}`;
const isTouch = matchMedia("(pointer: coarse)").matches;

// ---------- icônes (trait, 24px) ----------
const ICONS = {
  today: '<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/><circle cx="12" cy="15" r="1.7" fill="currentColor" stroke="none"/>',
  route: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H17a3.5 3.5 0 0 0 0-7H7a3.5 3.5 0 0 1 0-7h8.5"/>',
  ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 17v2M13 11v2"/>',
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  more: '<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  chev: '<path d="m9 18 6-6-6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  bed: '<path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/><path d="M12 4v6M2 17h20"/>',
  train: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M9 21l1.5-4M15 21l-1.5-4"/><path d="M9 14h.01M15 14h.01"/>',
  plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.5"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  spark: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 17v4M17 19h4"/>',
  wallet: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a2 2 0 0 1 2 2v1.5M3 7.5v9A2.5 2.5 0 0 0 5.5 19H19a2 2 0 0 0 2-2v-6.5a2 2 0 0 0-2-2H5.5A2.5 2.5 0 0 1 3 6"/><circle cx="16.5" cy="13.5" r="1.2" fill="currentColor" stroke="none"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  paste: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  map: '<path d="M9 4 3 6.5v14L9 18l6 2.5 6-2.5v-14L15 6.5 9 4Z"/><path d="M9 4v14M15 6.5v14"/>',
  locate: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  glasses: '<circle cx="7" cy="14" r="3.5"/><circle cx="17" cy="14" r="3.5"/><path d="M10.5 14h3M3.5 14 5 8h2M20.5 14 19 8h-2"/>',
  pill: '<rect x="3.5" y="8.5" width="17" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="m9.5 14.5 5-5"/>',
  coffee: '<path d="M4 8h12v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M16 10h2a2 2 0 0 1 0 4h-2M7 3.5v2M10 3.5v2M13 3.5v2"/>',
};
const icon = (n, s = 22) => `<svg class="i" viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ""}</svg>`;
const TYPE = { flight: ["Vol", "plane"], train: ["Train", "train"], hotel: ["Logement", "bed"], activity: ["Activité", "spark"] };

// ---------- jeton / thème ----------
function loadToken() {
  const u = new URL(location.href);
  const t = u.searchParams.get("token");
  if (t) { localStorage.setItem("tripToken", t); u.searchParams.delete("token"); history.replaceState(null, "", u.pathname + u.search + u.hash); }
  S.token = localStorage.getItem("tripToken") || "";
  S.theme = localStorage.getItem("tripTheme") || "auto";
  try { S.queue = JSON.parse(localStorage.getItem("tripQueue") || "[]"); } catch (_) { S.queue = []; }
}
function applyTheme(t) {
  S.theme = t; localStorage.setItem("tripTheme", t);
  if (t === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
}
function withToken(url) { return S.token ? url + (url.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(S.token) : url; }
const authHeaders = () => S.token ? { Authorization: "Bearer " + S.token } : {};

// ---------- API + file d'attente hors ligne ----------
async function api(method, path, body) {
  let res;
  try {
    res = await fetch("api/" + path, { method, headers: { "Content-Type": "application/json", ...authHeaders() }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (netErr) {
    if (method === "GET") throw netErr;
    enqueue({ method, path, body }); applyLocal(method, path, body);
    setStatus("offline"); return { queued: true };
  }
  if (res.status === 401) { localStorage.removeItem("tripToken"); S.token = ""; renderLogin(); throw new Error("Jeton invalide"); }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || res.statusText);
  return json;
}
function enqueue(op) { S.queue.push(op); localStorage.setItem("tripQueue", JSON.stringify(S.queue)); }
function applyLocal(method, path, body) {
  const [coll, id] = path.split("/");
  const d = S.data; if (!d) return;
  if (["trip", "budget"].includes(coll) && method === "PATCH") Object.assign(d[coll] = d[coll] || {}, body);
  else if (d[coll] && Array.isArray(d[coll])) {
    if (method === "POST") d[coll].push({ ...body, id: body.id || "local-" + Date.now().toString(36) });
    else if (method === "PATCH") { const it = d[coll].find(x => x.id === id); if (it) Object.assign(it, body); }
    else if (method === "DELETE") d[coll] = d[coll].filter(x => x.id !== id);
  }
  localStorage.setItem("tripState", JSON.stringify(d));
  render();
}
async function replayQueue() {
  while (S.queue.length) {
    const op = S.queue[0];
    try {
      const res = await fetch("api/" + op.path, { method: op.method, headers: { "Content-Type": "application/json", ...authHeaders() }, body: op.body === undefined ? undefined : JSON.stringify(op.body) });
      if (res.status >= 500) return false;
    } catch (_) { return false; }
    S.queue.shift(); localStorage.setItem("tripQueue", JSON.stringify(S.queue));
  }
  return true;
}
async function refresh() {
  try {
    if (S.queue.length) { const ok = await replayQueue(); if (!ok) { setStatus("offline"); return; } toast("Modifications hors ligne envoyées"); }
    const d = await api("GET", "state");
    S.data = d; localStorage.setItem("tripState", JSON.stringify(d));
    if (!S.me) api("GET", "me").then(m => { S.me = m; }).catch(() => {});
    setStatus(S.es && S.es.readyState === 1 ? "live" : "sync");
    render();
    precacheFiles();
  } catch (e) {
    if (!S.data) { const c = localStorage.getItem("tripState"); if (c) { S.data = JSON.parse(c); render(); } }
    setStatus("offline");
  }
}
async function mutate(fn, okMsg) {
  try { const r = await fn(); if (r && r.queued) toast("Hors ligne : envoyé au retour du réseau"); else if (okMsg) toast(okMsg); }
  catch (e) { toast(e.message || "Erreur", true); }
  if (!S.queue.length) refresh();
}
// suppression avec « Annuler » : on recrée l'élément avec le même id
function removeWithUndo(coll, item, msg) {
  mutate(() => api("DELETE", coll + "/" + item.id));
  toast(msg, false, { label: "Annuler", run: () => mutate(() => api("POST", coll, item), "Restauré") });
}
// confirmations disponibles hors ligne : le service worker les garde en cache
function precacheFiles() {
  if (!navigator.serviceWorker?.controller || !S.data) return;
  const urls = (S.data.bookings || []).filter(b => b.file).map(b => new URL(fileUrl(b.file), location.href).href);
  navigator.serviceWorker.controller.postMessage({ type: "precache", urls });
}

// ---------- temps réel ----------
function connectSSE() {
  if (S.es) S.es.close();
  const es = new EventSource(withToken("api/events"));
  S.es = es;
  es.onopen = () => setStatus("live");
  const onEvt = e => { const v = JSON.parse(e.data).version; if (!S.data || S.data.version !== v) refresh(); };
  es.addEventListener("hello", onEvt); es.addEventListener("change", onEvt);
  es.onerror = () => setStatus(!navigator.onLine || S.status === "offline" ? "offline" : "sync");
}
// l'état n'apparaît que s'il y a quelque chose à signaler
function setStatus(st) {
  S.status = st;
  const el = $("#status"); if (!el) return;
  const pend = S.queue.length;
  const show = st === "offline" || pend > 0;
  el.hidden = !show;
  el.className = "status " + st;
  el.innerHTML = `<i></i>${st === "offline" ? "Hors ligne" : "Synchronisation"}${pend ? ` · ${pend}` : ""}`;
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.token) { refresh(); if (!S.es || S.es.readyState === 2) connectSSE(); } });
window.addEventListener("online", () => { refresh(); connectSSE(); });
window.addEventListener("offline", () => setStatus("offline"));

// ---------- navigation ----------
// #today · #itinerary · #day/<id> · #bookings · #bk/<id> · #notebook/<ideas|budget|notes> · #tasks · #jetlag · #map · #map/<dayId>
// anciens liens (notifications de l'assistant) : #now #days #tasks #budget #ideas
const ALIAS = { "": "today", now: "today", days: "itinerary", budget: "notebook/budget", ideas: "notebook/ideas" };
function parseHash(h) {
  h = decodeURIComponent(String(h || "").replace(/^#/, ""));
  h = ALIAS[h] ?? h;
  const [a, ...rest] = h.split("/"); const b = rest.join("/");
  if (a === "day" && b) return { view: "itinerary", page: "day", id: b };
  if (a === "bk" && b) return { view: "bookings", page: "bk", id: b };
  if (a === "tasks") return { view: "today", page: "tasks" };
  if (a === "jetlag") return { view: "today", page: "jetlag" };
  if (a === "map") return { view: "map", id: b || "" };
  if (a === "notebook") return { view: "notebook", sub: ["ideas", "budget", "notes"].includes(b) ? b : "ideas" };
  if (["today", "itinerary", "bookings"].includes(a)) return { view: a };
  return { view: "today" };
}
const routeHash = r => r.view === "map" ? "#map" + (r.id ? "/" + r.id : "") : r.page === "day" ? `#day/${r.id}` : r.page === "bk" ? `#bk/${r.id}` : r.page === "tasks" ? "#tasks" : r.page === "jetlag" ? "#jetlag" : r.view === "notebook" ? `#notebook/${r.sub || "ideas"}` : "#" + r.view;
function transition(fn) { if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) document.startViewTransition(fn); else fn(); }
// ouvrir une page détail : entrée d'historique (bouton retour Android / navigateur)
function go(hash, { push = true } = {}) {
  const r = parseHash(hash);
  if (push && routeHash(r) !== location.hash) history.pushState({ app: 1 }, "", routeHash(r)); else history.replaceState(history.state, "", routeHash(r));
  transition(() => { S.route = r; render(); window.scrollTo(0, 0); });
}
function goBack() {
  if (history.state && history.state.app) history.back();
  else { const r = S.route; go(r.page === "tasks" || r.page === "jetlag" ? "#today" : "#" + r.view, { push: false }); }
}
window.addEventListener("popstate", () => transition(() => { if (!$("#modal").hidden) closeModal(null); S.route = parseHash(location.hash); render(); }));

// ---------- toast ----------
let toastTimer;
function toast(msg, err, action) {
  const t = $("#toast");
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ""}`;
  t.className = "toast" + (err ? " err" : ""); t.hidden = false;
  if (action) t.querySelector("button").onclick = () => { t.hidden = true; action.run(); };
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, action ? 5000 : 2600);
}

// ---------- feuilles (bottom sheets) ----------
let sheetClose = null;
function openSheet(html, { onClose, cls = "" } = {}) {
  const m = $("#modal");
  m.innerHTML = `<div class="sheet ${cls}" role="dialog" aria-modal="true"><div class="grab" aria-hidden="true"></div>${html}</div>`;
  m.hidden = false;
  requestAnimationFrame(() => m.classList.add("open"));
  sheetClose = onClose || null;
  m.onclick = e => { if (e.target === m) closeModal(); };
  bindSheetDrag(m.querySelector(".sheet"));
  return m.querySelector(".sheet");
}
function closeModal(result) {
  const m = $("#modal"); if (m.hidden) return;
  const cb = sheetClose; sheetClose = null;
  m.classList.remove("open");
  setTimeout(() => { if (!m.classList.contains("open")) { m.hidden = true; m.innerHTML = ""; } }, 220);
  if (cb) cb(result);
}
// glisser vers le bas pour fermer
function bindSheetDrag(sh) {
  let y0 = null, dy = 0;
  sh.addEventListener("touchstart", e => { const body = sh.querySelector(".sheet-body"); if ((body && body.scrollTop > 0 && !e.target.closest(".grab,.sheet-head")) || e.target.closest("input,textarea,select")) return; y0 = e.touches[0].clientY; dy = 0; }, { passive: true });
  sh.addEventListener("touchmove", e => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); if (dy > 4) { sh.style.transition = "none"; sh.style.transform = `translateY(${dy}px)`; } }, { passive: true });
  sh.addEventListener("touchend", () => { if (y0 == null) return; sh.style.transition = ""; sh.style.transform = ""; if (dy > 110) closeModal(null); y0 = null; }, { passive: true });
}
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#modal").hidden) closeModal(null); });

// menu d'actions (•••)
function actionSheet(title, items) {
  openSheet(`<div class="sheet-body"><h3 class="sheet-title">${esc(title)}</h3><div class="menu">${items.filter(Boolean).map((it, i) => `<button type="button" class="menu-item${it.danger ? " danger" : ""}" data-i="${i}">${icon(it.icon || "chev", 20)}<span>${esc(it.label)}</span></button>`).join("")}</div>
    <button type="button" class="btn ghost block" data-close>Fermer</button></div>`);
  const list = items.filter(Boolean);
  $("#modal").querySelectorAll(".menu-item").forEach(b => b.onclick = () => { closeModal(); setTimeout(() => list[+b.dataset.i].run(), 60); });
  $("#modal [data-close]").onclick = () => closeModal();
}

// ---------- formulaires ----------
// champs : { key, label, type: text|textarea|number|date|time|select|chips|tags|file|day, options, placeholder, advanced, showIf(v) }
function form(title, fields, values = {}, opts = {}) {
  return new Promise(resolve => {
    const fieldHtml = f => {
      const v = values[f.key] ?? f.default ?? "";
      const id = "f-" + f.key;
      let input;
      if (f.type === "textarea") input = `<textarea id="${id}" name="${f.key}" rows="3" placeholder="${esc(f.placeholder || "")}">${esc(v)}</textarea>`;
      else if (f.type === "select" || f.type === "day") {
        const options = f.type === "day" ? [["", "—"]].concat((S.data.days || []).map(d => [d.id, `${fmtDow(d.date)} ${fmtDay(d.date)} · ${d.city}`])) : f.options;
        input = `<select id="${id}" name="${f.key}">${options.map(o => `<option value="${esc(o[0])}" ${o[0] == v ? "selected" : ""}>${esc(o[1])}</option>`).join("")}</select>`;
      }
      else if (f.type === "chips") input = `<div class="chips" role="radiogroup" data-key="${f.key}">${f.options.map(o => `<button type="button" role="radio" aria-checked="${o[0] == v}" class="chip${o[0] == v ? " on" : ""}" data-v="${esc(o[0])}">${esc(o[1])}</button>`).join("")}</div><input type="hidden" name="${f.key}" value="${esc(v)}">`;
      else if (f.type === "tags") { const arr = Array.isArray(v) ? v : String(v).split(",").map(s => s.trim()).filter(Boolean); input = `<div class="chips multi" data-key="${f.key}">${f.options.map(o => `<button type="button" role="checkbox" aria-checked="${arr.includes(o[0])}" class="chip${arr.includes(o[0]) ? " on" : ""}" data-v="${esc(o[0])}">${esc(o[1])}</button>`).join("")}</div><input type="hidden" name="${f.key}" value="${esc(arr.join(","))}">`; }
      else if (f.type === "file") input = `<div class="filefield"><span class="fname">${v ? esc(v) : "Aucun fichier"}</span><button type="button" class="btn ghost sm" data-upload="${f.key}">${v ? "Remplacer" : "Joindre"}</button></div><input type="hidden" name="${f.key}" value="${esc(v)}">`;
      else {
        let type = f.type || "text";
        if (type === "time" && v && !/^\d{2}:\d{2}$/.test(v)) type = "text"; // plages « 15:00–19:00 » gardées en texte
        input = `<input id="${id}" name="${f.key}" type="${type}" value="${esc(v)}" ${type === "number" ? 'step="any" inputmode="decimal"' : ""} placeholder="${esc(f.placeholder || "")}" ${f.big ? 'class="big"' : ""}>`;
      }
      return `<div class="field" data-field="${f.key}"><label for="${id}">${esc(f.label)}</label>${input}</div>`;
    };
    const main = fields.filter(f => !f.advanced), adv = fields.filter(f => f.advanced);
    openSheet(`<form id="mf" novalidate><div class="sheet-head"><button type="button" class="link" data-cancel>Annuler</button><b>${esc(title)}</b><button type="submit" class="link strong">${esc(opts.submit || "Enregistrer")}</button></div>
      <div class="sheet-body">${main.map(fieldHtml).join("")}
      ${adv.length ? `<details class="adv"><summary>Plus de détails</summary>${adv.map(fieldHtml).join("")}</details>` : ""}
      ${opts.onDelete ? `<div class="danger-zone"><button type="button" class="btn danger block" data-del>${esc(opts.deleteLabel || "Supprimer")}</button></div>` : ""}
      </div></form>`, { cls: "form", onClose: r => resolve(r ?? null) });
    const m = $("#modal"), fm = $("#mf");
    const current = () => { const o = { ...values }; fields.forEach(f => { const el = fm.elements[f.key]; if (el) o[f.key] = el.value; }); return o; };
    const sync = () => { const cur = current(); fields.forEach(f => { if (f.showIf) m.querySelector(`[data-field="${f.key}"]`).hidden = !f.showIf(cur); }); };
    m.querySelectorAll(".chips").forEach(g => g.addEventListener("click", e => {
      const b = e.target.closest(".chip"); if (!b) return;
      const hidden = fm.elements[g.dataset.key];
      if (g.classList.contains("multi")) { b.classList.toggle("on"); b.setAttribute("aria-checked", b.classList.contains("on")); hidden.value = [...g.querySelectorAll(".chip.on")].map(x => x.dataset.v).join(","); }
      else { g.querySelectorAll(".chip").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", x === b); }); hidden.value = b.dataset.v; }
      sync();
    }));
    m.querySelectorAll("[data-upload]").forEach(b => b.onclick = async () => {
      try { const f = await uploadFile("doc", "image/*,application/pdf"); if (!f) return; fm.elements[b.dataset.upload].value = f; b.previousElementSibling.textContent = f; b.textContent = "Remplacer"; }
      catch (e) { toast(e.message, true); }
    });
    fm.addEventListener("change", sync); sync();
    m.querySelector("[data-cancel]").onclick = () => closeModal(null);
    if (opts.onDelete) {
      const del = m.querySelector("[data-del]");
      del.onclick = () => {
        if (!del.classList.contains("armed")) { del.classList.add("armed"); del.textContent = "Confirmer la suppression"; return; }
        closeModal(null); opts.onDelete();
      };
    }
    fm.onsubmit = e => {
      e.preventDefault();
      const out = {};
      fields.forEach(f => {
        let v = fm.elements[f.key].value;
        if (f.type === "number") v = v === "" ? null : Number(String(v).replace(",", "."));
        if (f.type === "tags") v = v ? v.split(",") : [];
        out[f.key] = v;
      });
      closeModal(out);
    };
    if (!isTouch) setTimeout(() => { const first = m.querySelector(".sheet-body input:not([type=hidden]),.sheet-body textarea"); if (first) first.focus(); }, 80);
    else if (opts.focus) setTimeout(() => fm.elements[opts.focus]?.focus(), 250);
  });
}

// fichiers : photos redimensionnées côté client, PDF envoyés tels quels
function pickFile(accept) {
  return new Promise(resolve => { const inp = $("#fileInput"); inp.value = ""; inp.accept = accept; inp.onchange = () => resolve(inp.files[0] || null); inp.click(); });
}
async function resizeImage(file, max = 1600, q = .82) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(r, "image/jpeg", q));
}
async function uploadFile(prefix, accept = "image/*") {
  const f = await pickFile(accept); if (!f) return null;
  toast("Envoi…");
  const isImg = f.type.startsWith("image/");
  const blob = isImg ? await resizeImage(f) : f;
  const ext = isImg ? "jpg" : (f.name.split(".").pop() || "pdf").toLowerCase();
  const name = `${prefix}-${Date.now().toString(36)}.${ext}`;
  const res = await fetch("api/upload/" + encodeURIComponent(name), { method: "PUT", headers: { "Content-Type": isImg ? "image/jpeg" : (f.type || "application/octet-stream"), ...authHeaders() }, body: blob });
  if (!res.ok) throw new Error("Envoi impossible");
  return (await res.json()).file;
}

// ---------- dérivés ----------
function stages() {
  const out = [];
  for (const d of S.data.days) {
    const last = out[out.length - 1];
    if (last && cityKey(last.city) === cityKey(d.city)) { last.days.push(d); last.end = d.date; }
    else out.push({ city: d.city, key: cityKey(d.city), start: d.date, end: d.date, days: [d] });
  }
  out.forEach((s, i) => { s.idx = i; s.nights = Math.max(0, daysBetween(s.start, s.end) + (i < out.length - 1 ? 1 : 0)); s.lodging = s.days.map(d => booking(d.lodging?.bookingId)).find(Boolean); s.guide = (S.data.guides || []).find(g => cityKey(g.city) === s.key); });
  return out;
}
const trainsOf = d => (S.data.bookings || []).filter(b => b.type === "train" && (b.dayId === d.id || (!b.dayId && b.checkin === d.date))).sort((a, b) => (a.checkinTime || "").localeCompare(b.checkinTime || ""));
const expensesOf = date => (S.data.expenses || []).filter(e => e.date === date);
function deadlines(limit = 3) {
  const t = todayISO();
  return (S.data.bookings || []).filter(b => b.cancelBy && b.status === "confirmed" && b.cancelBy >= t).sort((a, b) => a.cancelBy.localeCompare(b.cancelBy)).slice(0, limit);
}
const openTasks = () => { const ts = S.data.tasks.filter(x => x.col !== "done"); const rank = { critical: 0, booking: 1 }; return ts.slice().sort((a, b) => (rank[a.priority] ?? 2) - (rank[b.priority] ?? 2)); };
const prepPct = () => { const n = S.data.tasks.length; return n ? Math.round(S.data.tasks.filter(t => t.col === "done").length / n * 100) : 0; };
const alertVisible = () => {
  const tr = S.data.trip; if (!tr.alert) return false;
  if (tr.alertTaskId) { const t = S.data.tasks.find(x => x.id === tr.alertTaskId); if (t && t.col === "done") return false; }
  return phase() === "before";
};
// programme horodaté d'une journée : vols, trains, check-in/out
function timeline(d) {
  const items = [];
  for (const b of S.data.bookings || []) {
    if (b.type === "flight" && (b.checkin === d.date || b.checkout === d.date)) {
      if (b.checkin === d.date) items.push({ time: b.checkinTime, icon: "plane", title: b.name, sub: [b.from, b.to].filter(Boolean).join(" → "), bk: b.id });
      else items.push({ time: b.checkoutTime, icon: "plane", title: "Arrivée · " + (b.to || b.name), sub: b.name, bk: b.id });
    }
    if (b.type === "hotel" && b.status === "confirmed") {
      if (b.checkout === d.date) items.push({ time: b.checkoutTime, icon: "bed", title: "Check-out", sub: b.name, bk: b.id });
      if (b.checkin === d.date) items.push({ time: b.checkinTime, icon: "bed", title: "Check-in", sub: b.name, bk: b.id });
    }
    if (b.type === "activity" && b.checkin === d.date) items.push({ time: b.checkinTime, icon: "spark", title: b.name, sub: b.ref ? "réf. " + b.ref : "", bk: b.id });
  }
  for (const b of trainsOf(d)) items.push({ time: b.checkinTime, icon: "train", title: b.name, sub: [[b.from, b.to].filter(Boolean).join(" → "), b.car && "voiture " + b.car, b.seat && "sièges " + b.seat, b.track && "voie " + b.track].filter(Boolean).join(" · "), bk: b.id, todo: b.status !== "confirmed" });
  return items.sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
}

// ---------- rendu ----------
const TITLES = { today: "Aujourd'hui", itinerary: "Itinéraire", bookings: "Résas", notebook: "Carnet", map: "Carte" };
function topbar({ back, title, right = "" }) {
  $("#tbLeft").innerHTML = back ? `<button class="navback" data-act="back">${icon("back", 22)}<span>${esc(back)}</span></button>` : "";
  $("#tbTitle").textContent = title || "";
  $("#tbRight").innerHTML = `<div class="status" id="status" hidden></div>${right}`;
}
const tbBtn = (act, ic, label, extra = "") => `<button class="iconbtn" data-act="${act}" ${extra} aria-label="${esc(label)}" title="${esc(label)}">${icon(ic, 22)}</button>`;
function render() {
  if (!S.token) return renderLogin();
  document.body.classList.remove("is-login");
  if (!S.data) { topbar({}); $("#view").innerHTML = skeleton(); return; }
  const r = S.route;
  if (r.view === "notebook") S.lastSub = r.sub;
  document.querySelectorAll("#tabs button").forEach(b => { const on = b.dataset.view === r.view; b.classList.toggle("active", on); b.setAttribute("aria-current", on ? "page" : "false"); });
  let html;
  if (r.page === "day") html = renderDay(r.id);
  else if (r.page === "bk") html = renderBooking(r.id);
  else if (r.page === "tasks") html = renderTasks();
  else if (r.page === "jetlag") html = renderJetlag();
  else html = ({ today: renderToday, itinerary: renderItinerary, bookings: renderBookings, notebook: renderNotebook, map: renderMap }[r.view] || renderToday)();
  $("#view").innerHTML = html;
  document.body.classList.toggle("is-map", r.view === "map");
  if (r.view === "map") mountMap(); else MAP.fromRoute = "";
  setStatus(S.status);
  observeLargeTitle();
}
const skeleton = () => `<div class="skel"><i style="width:55%;height:34px"></i><i style="height:150px"></i><i style="height:64px"></i><i style="height:64px"></i><i style="height:64px"></i></div>`;
// le titre compact apparaît dans la barre quand le grand titre sort de l'écran
let titleObs;
function observeLargeTitle() {
  if (titleObs) titleObs.disconnect();
  const lt = $("#view .large-title"), bar = $(".topbar");
  if (!lt || !("IntersectionObserver" in window)) { bar.classList.toggle("scrolled", !lt); return; }
  titleObs = new IntersectionObserver(([e]) => bar.classList.toggle("scrolled", !e.isIntersecting), { rootMargin: "-56px 0px 0px 0px" });
  titleObs.observe(lt);
}
const largeTitle = (t, sub) => `<header class="page-head"><h1 class="large-title">${esc(t)}</h1>${sub ? `<p class="page-sub">${sub}</p>` : ""}</header>`;
function renderLogin() {
  document.body.classList.add("is-login");
  topbar({});
  $("#view").innerHTML = `<div class="login"><div class="sun" aria-hidden="true"></div><h1>${esc(document.querySelector('meta[name="trip-title"]')?.content || "Carnet de voyage")}</h1><p class="muted">Entre ton jeton d'accès pour ouvrir le carnet de voyage.</p>
  <form id="login"><input type="password" name="t" placeholder="Jeton" autocomplete="current-password" aria-label="Jeton"><button class="btn block" type="submit">Ouvrir</button></form></div>`;
  $("#login").onsubmit = e => { e.preventDefault(); S.token = e.target.t.value.trim(); localStorage.setItem("tripToken", S.token); boot(); };
}

// lignes de liste réutilisables
const row = ({ act, attrs = "", lead = "", title, sub = "", trail = "", cls = "" }) =>
  `<${act ? "button type=\"button\"" : "div"} class="row ${cls}" ${act ? `data-act="${act}"` : ""} ${attrs}>${lead ? `<span class="lead">${lead}</span>` : ""}<span class="body"><span class="t">${title}</span>${sub ? `<span class="s">${sub}</span>` : ""}</span>${trail ? `<span class="trail">${trail}</span>` : ""}</${act ? "button" : "div"}>`;
const badge = (txt, tone = "") => `<span class="badge ${tone}">${esc(txt)}</span>`;
const section = (title, body, action = "") => `<section class="sec">${title ? `<div class="sec-head"><h2>${esc(title)}</h2>${action}</div>` : ""}${body}</section>`;

// --- Aujourd'hui ---
function taskRow(t, compact) {
  const done = t.col === "done";
  const flag = t.priority === "critical" ? badge("Urgent", "red") : t.col === "check" ? badge("À vérifier", "amber") : "";
  return `<div class="row task${done ? " done" : ""}"><button type="button" class="check" data-act="toggleTask" data-id="${esc(t.id)}" role="checkbox" aria-checked="${done}" aria-label="${done ? "Rouvrir" : "Marquer comme fait"}">${done ? icon("check", 16) : ""}</button>
    <button type="button" class="body" data-act="editTask" data-id="${esc(t.id)}"><span class="t">${esc(t.title)}</span>${t.desc && !done && !compact ? `<span class="s clamp2">${esc(t.desc)}</span>` : ""}${(t.deadline || flag) && !done ? `<span class="meta">${flag}${t.deadline ? `<span>${esc(t.deadline)}</span>` : ""}</span>` : ""}</button></div>`;
}
function renderToday() {
  const d = S.data, t = todayISO(), ph = phase();
  const now = new Date();
  topbar({ title: "Aujourd'hui", right: tbBtn("settings", "settings", "Réglages") });
  const head = largeTitle("Aujourd'hui", `${DAYS_LONG[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()].replace(".", "")}`);
  if (ph === "before") {
    const left = daysBetween(t, d.trip.start), pct = prepPct(), open = openTasks();
    const out = (d.bookings || []).find(b => b.type === "flight");
    const hero = `<div class="hero"><span class="eyebrow">Départ dans</span><div class="big">${left}<small> jour${left > 1 ? "s" : ""}</small></div>
      <p>${fmtDow(d.trip.start)} ${fmtDay(d.trip.start)}${out?.from ? ` · ${esc(out.from.replace(/\s*\(.*\)/, ""))} → ${esc((out.to || d.trip.destination || "").replace(/\s*\(.*\)/, ""))}` : ""}</p>
      <button type="button" class="hero-progress" data-go="#tasks"><span>Préparation</span><span class="bar"><i style="width:${pct}%"></i></span><b>${pct} %</b></button></div>`;
    const alert = alertVisible() ? `<button type="button" class="callout" data-act="toggleClamp">${icon("alert", 20)}<span class="clamp2">${esc(d.trip.alert)}</span></button>` : "";
    const dl = deadlines(2);
    return head + hero + alert
      + section("À faire", open.length ? `<div class="list">${open.slice(0, 3).map(t => taskRow(t, true)).join("")}</div>` : `<p class="empty-inline">Tout est prêt.</p>`, `<button class="link" data-go="#tasks">Tout voir${open.length > 3 ? ` (${open.length})` : ""}</button>`)
      + (jlEntry() ? section("", jlEntry()) : "")
      + (dl.length ? section("Annulation gratuite", `<div class="list">${dl.map(b => row({ act: "openBk", attrs: `data-id="${esc(b.id)}"`, lead: icon(TYPE[b.type]?.[1] || "ticket", 20), title: esc(b.name), sub: `jusqu'au ${fmtDay(b.cancelBy)}`, trail: deadlineBadge(b) + icon("chev", 18) })).join("")}</div>`) : "");
  }
  if (ph === "after") {
    const spent = (d.expenses || []).reduce((s, e) => s + toHome(e), 0);
    return head + `<div class="hero"><span class="eyebrow">De retour</span><div class="big">${d.days.length}<small> jours${d.trip.destination ? " · " + esc(d.trip.destination) : " de voyage"}</small></div><p>${money(spent)} dépensés sur place</p></div>`
      + (jlEntry() ? section("", jlEntry()) : "")
      + section("", `<div class="list">${row({ act: "go", attrs: 'data-href="#notebook/notes"', lead: icon("pen", 20), title: "Relire le carnet", trail: icon("chev", 18) })}${row({ act: "go", attrs: 'data-href="#notebook/budget"', lead: icon("wallet", 20), title: "Voir le budget", trail: icon("chev", 18) })}</div>`);
  }
  // pendant le voyage
  const today = d.days.find(x => x.date === t), tomorrow = d.days.find(x => x.date > t);
  const n = daysBetween(d.trip.start, t) + 1, total = daysBetween(d.trip.start, d.trip.end) + 1;
  const spent = expensesOf(t).reduce((s, e) => s + toHome(e), 0);
  let html = `<header class="page-head"><p class="eyebrow">Jour ${n} sur ${total}${today ? " · " + esc(today.city) : ""}</p><h1 class="large-title">${today ? esc(today.title) : "Journée libre"}</h1>${today?.summary ? `<p class="page-sub">${esc(today.summary)}</p>` : ""}${today?.weather ? `<p class="page-sub small">${icon("sun", 16)} ${esc(today.weather)}</p>` : ""}</header>`;
  const jl = jlEntry(); if (jl) html += section("", jl);
  if (today) {
    const tl = timeline(today);
    const acts = (today.activities || []);
    html += section("Programme", `<div class="list">${tl.map(tlRow).join("")}${acts.map(a => actRow(today, a)).join("")}${!tl.length && !acts.length ? `<p class="empty-inline">Rien de prévu : journée libre.</p>` : ""}</div>`, `<button class="link" data-go="#day/${esc(today.id)}">Détails</button>`);
    const lodge = booking(today.lodging?.bookingId);
    if (lodge) html += section("Ce soir", lodgeCard(lodge));
  }
  html += section("Dépenses du jour", `<div class="list">${row({ act: "addExpense", lead: icon("wallet", 20), title: money(spent), sub: today?.cost ? `sur ${money(today.cost)} estimés` : "", trail: `<span class="pill-btn">${icon("plus", 16)} Ajouter</span>` })}</div>`);
  if (tomorrow) html += section("Demain", `<div class="list">${row({ act: "go", attrs: `data-href="#day/${esc(tomorrow.id)}"`, lead: `<span class="datechip"><b>${parseISO(tomorrow.date).getDate()}</b>${fmtDow(tomorrow.date)}</span>`, title: esc(tomorrow.title), sub: esc(tomorrow.city) + (trainsOf(tomorrow)[0]?.checkinTime ? ` · train ${esc(trainsOf(tomorrow)[0].checkinTime)}` : ""), trail: icon("chev", 18) })}</div>`);
  const urgent = openTasks().filter(x => x.priority === "critical");
  if (urgent.length) html += section("À faire", `<div class="list">${urgent.slice(0, 3).map(t => taskRow(t, true)).join("")}</div>`, `<button class="link" data-go="#tasks">Tout voir</button>`);
  return html + `<button class="fab" data-act="addExpense" aria-label="Ajouter une dépense">${icon("plus", 22)}<span>Dépense</span></button>`;
}
const deadlineBadge = b => { const left = daysBetween(todayISO(), b.cancelBy); return left < 0 ? "" : badge(`J-${left}`, left <= 3 ? "red" : left <= 10 ? "amber" : ""); };
const tlRow = it => row({ act: it.bk ? "openBk" : "", attrs: it.bk ? `data-id="${esc(it.bk)}"` : "", lead: `<span class="time">${esc(String(it.time || "—").split(/[–-]/)[0].trim())}</span>`, title: `${icon(it.icon, 16)} ${esc(it.title)}`, sub: esc(it.sub || ""), trail: (it.todo ? badge("À réserver", "red") : "") + (it.bk ? icon("chev", 18) : ""), cls: "tl" });
function actRow(day, a) {
  const note = a.done ? "" : a.booking === "yes" ? badge("À réserver", "red") : a.booking === "maybe" ? badge("À vérifier", "amber") : "";
  return `<div class="row task${a.done ? " done" : ""}"><button type="button" class="check" data-act="toggleAct" data-day="${esc(day.id)}" data-id="${esc(a.id)}" role="checkbox" aria-checked="${!!a.done}" aria-label="${esc(a.title)}">${a.done ? icon("check", 16) : ""}</button>
    <span class="body"><span class="t">${esc(a.title)}</span>${note || a.url ? `<span class="meta">${note}${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener">${icon("link", 14)} lien</a>` : ""}</span>` : ""}</span></div>`;
}
function lodgeCard(b) {
  const todo = b.status !== "confirmed";
  return `<div class="card lodge"><button type="button" class="lodge-main" data-act="openBk" data-id="${esc(b.id)}"><span class="lead">${icon("bed", 20)}</span><span class="body"><span class="t">${esc(b.name)}</span><span class="s">${todo ? "" : esc([b.checkinTime && "arrivée " + b.checkinTime, b.checkoutTime && "départ " + b.checkoutTime].filter(Boolean).join(" · "))}</span>${b.address ? `<span class="s">${esc(b.address)}</span>` : ""}</span>${todo ? badge("À réserver", "red") : icon("chev", 18)}</button>
    ${todo ? "" : `<div class="quick">${b.address ? `<a class="qbtn" href="${mapsUrl(b)}" target="_blank" rel="noopener">${icon("pin", 20)}<span>Plan</span></a>` : ""}${b.phone ? `<a class="qbtn" href="tel:${esc(b.phone.replace(/\s/g, ""))}">${icon("phone", 20)}<span>Appeler</span></a>` : ""}${b.ref ? `<button type="button" class="qbtn" data-act="copy" data-text="${esc(b.ref)}">${icon("copy", 20)}<span>Réf.</span></button>` : ""}${b.file ? `<a class="qbtn" href="${fileUrl(b.file)}" target="_blank" rel="noopener">${icon("file", 20)}<span>Résa</span></a>` : ""}</div>`}</div>`;
}

// --- Tâches ---
function renderTasks() {
  const all = S.data.tasks, pct = prepPct();
  const todo = openTasks().filter(t => t.col === "todo"), check = openTasks().filter(t => t.col === "check"), done = all.filter(t => t.col === "done");
  topbar({ back: "Aujourd'hui", title: "Préparation", right: tbBtn("addTask", "plus", "Nouvelle tâche") });
  return largeTitle("Préparation", `${pct} % · ${done.length} sur ${all.length} terminées`)
    + `<div class="progress"><i style="width:${pct}%"></i></div>`
    + (todo.length ? section("À faire", `<div class="list">${todo.map(taskRow).join("")}</div>`) : "")
    + (check.length ? section("À vérifier", `<div class="list">${check.map(taskRow).join("")}</div>`) : "")
    + (!todo.length && !check.length ? `<div class="empty">${icon("check", 32)}<p>Tout est prêt.</p></div>` : "")
    + (done.length ? `<section class="sec"><button type="button" class="disclosure" data-act="toggleDone" aria-expanded="${S.showDone}">${icon("chev", 18)}<span>Terminées (${done.length})</span></button>${S.showDone ? `<div class="list">${done.map(taskRow).join("")}</div>` : ""}</section>` : "");
}

// --- Itinéraire ---
function renderItinerary() {
  const t = todayISO(), sts = stages();
  const current = sts.find(s => t >= s.start && t <= s.end);
  topbar({ title: "Itinéraire", right: tbBtn("addDay", "plus", "Nouvelle journée") });
  const d = S.data;
  const strip = `<nav class="stages" aria-label="Étapes">${sts.map(s => `<button type="button" data-scroll="stage-${s.idx}" class="${current === s ? "current" : ""}">${esc(s.city)}<small>${s.days.length} j</small></button>`).join("")}</nav>`;
  const body = sts.map(s => {
    const l = s.lodging;
    const sub = `${fmtDay(s.start)}${s.end !== s.start ? " – " + fmtDay(s.end) : ""}${s.nights ? ` · ${s.nights} nuit${s.nights > 1 ? "s" : ""}` : ""}`;
    return `<section class="stage" id="stage-${s.idx}"><div class="stage-head"><h2>${esc(s.city)}</h2><p>${sub}${l ? ` · ${esc(l.name)}` : ""} ${l && l.status !== "confirmed" ? badge("À réserver", "red") : ""}</p></div>
      <div class="list">${s.guide ? row({ act: "openGuide", attrs: `data-id="${esc(s.guide.id)}"`, lead: icon("info", 20), title: esc(s.guide.title || "Repères"), trail: icon("chev", 18), cls: "guide-row" }) : ""}${s.days.map(x => dayRow(x, t)).join("")}</div></section>`;
  }).join("");
  return largeTitle("Itinéraire", `${fmtDay(d.trip.start)} – ${fmtDay(d.trip.end)} · ${d.days.length} jours`) + strip + (body || `<div class="empty"><p>Aucune journée</p></div>`);
}
function dayRow(d, t) {
  const trains = trainsOf(d), tr = d.transport || {};
  const needsBooking = (tr.booking === "required" && !trains.length) || (d.activities || []).some(a => a.booking === "yes" && !a.done);
  const hints = [(d.tags || []).includes("move") ? "transfert" : "", trains.length ? `train ${trains[0].checkinTime || ""}`.trim() : ""].filter(Boolean).join(" · ");
  const x = parseISO(d.date);
  return row({ act: "go", attrs: `data-href="#day/${esc(d.id)}" id="day-${esc(d.id)}"`, cls: "day" + (d.date === t ? " today" : "") + (d.date < t ? " past" : ""),
    lead: `<span class="datechip"><b>${x.getDate()}</b>${fmtDow(d.date)}</span>`,
    title: esc(d.title), sub: esc(hints || d.summary || ""), trail: (d.date === t ? badge("Aujourd'hui", "red") : needsBooking ? badge("À réserver", "red") : "") + icon("chev", 18) });
}
function renderDay(id) {
  const d = S.data.days.find(x => x.id === id);
  if (!d) { topbar({ back: "Itinéraire" }); return `<div class="empty"><p>Journée introuvable</p></div>`; }
  topbar({ back: "Itinéraire", title: `${fmtDay(d.date)}`, right: tbBtn("dayMenu", "more", "Actions", `data-id="${esc(d.id)}"`) });
  const tr = d.transport || {}, trains = trainsOf(d), tl = timeline(d), lodge = booking(d.lodging?.bookingId);
  const exp = expensesOf(d.date), spent = exp.reduce((s, e) => s + toHome(e), 0);
  const guide = (S.data.guides || []).find(g => cityKey(g.city) === cityKey(d.city));
  let html = `<header class="page-head"><p class="eyebrow">${DAYS_LONG[parseISO(d.date).getDay()]} ${fmtDay(d.date)} · ${esc(d.city)}</p><h1 class="large-title">${esc(d.title)}</h1>${d.summary ? `<p class="page-sub">${esc(d.summary)}</p>` : ""}${d.weather ? `<p class="page-sub small">${icon("sun", 16)} ${esc(d.weather)}</p>` : ""}</header>`;
  const acts = d.activities || [];
  html += section("Programme", `<div class="list">${tl.map(tlRow).join("")}${acts.map(a => actRow(d, a)).join("")}${row({ act: "addAct", attrs: `data-day="${esc(d.id)}"`, lead: icon("plus", 20), title: "Ajouter une activité", cls: "add" })}</div>`, mapPlaces().some(p => p.days.includes(d)) ? `<button class="link" data-go="#map/${esc(d.id)}">Carte</button>` : "");
  if (tr.route && !trains.length) {
    const need = !trains.length && tr.booking === "required";
    html += section("Transport", `<div class="list">${row({ lead: icon("train", 20), title: esc(tr.route), sub: esc([!trains.length && tr.detail, !trains.length && tr.cost].filter(Boolean).join(" · ")), trail: need ? badge("À réserver", "red") : tr.booking === "recommended" && !trains.length ? badge("Conseillé", "amber") : "" })}${row({ act: "addTrain", attrs: `data-day="${esc(d.id)}"`, lead: icon("plus", 20), title: "Ajouter un billet", cls: "add" })}</div>`);
  }
  if (lodge) html += section("Logement", lodgeCard(lodge) + (d.lodging?.note ? `<p class="note-inline">${esc(d.lodging.note)}</p>` : ""));
  else if (d.lodging?.note) html += section("Logement", `<p class="note-inline">${esc(d.lodging.note)}</p>`);
  if (guide) html += section("", `<div class="list">${row({ act: "openGuide", attrs: `data-id="${esc(guide.id)}"`, lead: icon("info", 20), title: esc(guide.title || "Repères " + d.city), trail: icon("chev", 18) })}</div>`);
  html += section("Dépenses", `<div class="list">${exp.map(expRow).join("")}${row({ act: "addExpense", attrs: `data-date="${esc(d.date)}"`, lead: icon("plus", 20), title: "Ajouter une dépense", trail: exp.length ? `<b class="amt">${money(spent)}</b>` : "", cls: "add" })}</div>`);
  html += section("Notes", `<div class="list">${row({ act: "editDayNotes", attrs: `data-id="${esc(d.id)}"`, lead: icon("pen", 20), title: d.notes ? `<span class="prewrap">${esc(d.notes)}</span>` : "Ajouter une note", cls: d.notes ? "" : "add" })}</div>`);
  if (d.photos?.length) html += section("Photos", `<div class="photos">${d.photos.map(n => `<a href="${fileUrl(n)}" target="_blank" rel="noopener"><img src="${fileUrl(n)}" alt="" loading="lazy"></a>`).join("")}</div>`);
  return html;
}

// --- Réservations ---
function bkRow(b) {
  const [, ic] = TYPE[b.type] || ["", "ticket"];
  const when = b.checkin ? `${fmtDow(b.checkin)} ${fmtDay(b.checkin)}${b.checkinTime && b.type !== "hotel" ? " · " + b.checkinTime : ""}${b.type === "hotel" && b.checkout ? ` – ${fmtDay(b.checkout)}` : ""}` : "";
  const left = b.cancelBy && b.status === "confirmed" ? daysBetween(todayISO(), b.cancelBy) : -1;
  const trail = b.status !== "confirmed" ? badge("À réserver", "red") : left >= 0 && left <= 10 ? badge(`Annulation J-${left}`, left <= 3 ? "red" : "amber") : "";
  return row({ act: "openBk", attrs: `data-id="${esc(b.id)}"`, lead: `<span class="type-ic ${esc(b.type)}">${icon(ic, 20)}</span>`, title: esc(b.name), sub: esc(when), trail: trail + icon("chev", 18) });
}
function renderBookings() {
  const t = todayISO();
  const bs = S.data.bookings.slice().sort((a, b) => ((a.checkin || "") + (a.checkinTime || "")).localeCompare((b.checkin || "") + (b.checkinTime || "")));
  const todo = bs.filter(b => b.status !== "confirmed");
  const conf = bs.filter(b => b.status === "confirmed");
  const upcoming = conf.filter(b => (b.checkout || b.checkin || "9") >= t), past = conf.filter(b => (b.checkout || b.checkin || "9") < t);
  topbar({ title: "Résas", right: tbBtn("addBooking", "plus", "Nouvelle réservation") });
  return largeTitle("Résas", `${conf.length} confirmée${conf.length > 1 ? "s" : ""}${todo.length ? ` · ${todo.length} à réserver` : ""}`)
    + (todo.length ? section("À réserver", `<div class="list">${todo.map(bkRow).join("")}</div>`) : "")
    + section(inTrip() ? "À venir" : "Confirmées", upcoming.length ? `<div class="list">${upcoming.map(bkRow).join("")}</div>` : `<p class="empty-inline">Aucune réservation à venir.</p>`)
    + (past.length ? `<section class="sec"><button type="button" class="disclosure" data-act="togglePast" aria-expanded="${S.showPast}">${icon("chev", 18)}<span>Passées (${past.length})</span></button>${S.showPast ? `<div class="list">${past.map(bkRow).join("")}</div>` : ""}</section>` : "");
}
function renderBooking(id) {
  const b = booking(id);
  if (!b) { topbar({ back: "Résas" }); return `<div class="empty"><p>Réservation introuvable</p></div>`; }
  const [kind, ic] = TYPE[b.type] || [b.type, "ticket"];
  topbar({ back: "Résas", title: kind, right: tbBtn("bkMenu", "more", "Actions", `data-id="${esc(b.id)}"`) });
  const hotel = b.type === "hotel";
  const nights = hotel && b.checkin && b.checkout ? daysBetween(b.checkin, b.checkout) : 0;
  const facts = [
    b.checkin && [hotel ? "Arrivée" : "Départ", `${fmtDow(b.checkin)} ${fmtDay(b.checkin)}`, b.checkinTime],
    b.checkout && (b.checkout !== b.checkin || b.checkoutTime) && [hotel ? "Départ" : "Arrivée", `${fmtDow(b.checkout)} ${fmtDay(b.checkout)}`, b.checkoutTime],
  ].filter(Boolean);
  const place = [b.track && "voie " + b.track, b.car && "voiture " + b.car, b.seat && "sièges " + b.seat].filter(Boolean).join(" · ");
  const details = [["Trajet", [b.from, b.to].filter(Boolean).join(" → ")], ["Place", place], ["Via", b.platform], [hotel ? "Chambre" : "Classe", b.room], ["Repas", b.meals], ["Prix", b.price != null && b.price !== "" ? money(b.price) : ""], ["Notes", b.notes]].filter(x => x[1]);
  const left = b.cancelBy ? daysBetween(todayISO(), b.cancelBy) : null;
  return `<header class="page-head"><p class="eyebrow">${icon(ic, 16)} ${esc(kind)}${b.city ? " · " + esc(b.city) : ""}</p><h1 class="large-title">${esc(b.name)}</h1>${b.status !== "confirmed" ? `<p class="page-sub">${badge("À réserver", "red")}</p>` : nights ? `<p class="page-sub">${nights} nuit${nights > 1 ? "s" : ""}</p>` : ""}</header>
    ${facts.length ? `<div class="facts">${facts.map(f => `<div><span>${f[0]}</span><b>${esc(f[1])}</b>${f[2] ? `<em>${esc(f[2])}</em>` : ""}</div>`).join("")}</div>` : ""}
    ${b.ref ? `<button type="button" class="refcard" data-act="copy" data-text="${esc(b.ref)}"><span>Référence${b.pin ? " · PIN " + esc(b.pin) : ""}</span><b>${esc(b.ref)}</b>${icon("copy", 20)}</button>` : ""}
    <div class="quick big">${b.file ? `<a class="qbtn primary" href="${fileUrl(b.file)}" target="_blank" rel="noopener">${icon("file", 22)}<span>Confirmation</span></a>` : ""}${b.address ? `<a class="qbtn" href="${mapsUrl(b)}" target="_blank" rel="noopener">${icon("pin", 22)}<span>Plan</span></a>` : ""}${b.phone ? `<a class="qbtn" href="tel:${esc(b.phone.replace(/\s/g, ""))}">${icon("phone", 22)}<span>Appeler</span></a>` : ""}</div>
    ${b.cancelBy ? `<p class="callout ${left != null && left >= 0 && left <= 10 ? "warn" : "quiet"}">${icon("calendar", 20)}<span>${left >= 0 ? `Annulation gratuite jusqu'au ${fmtDay(b.cancelBy)} (J-${left})` : `Annulation gratuite terminée le ${fmtDay(b.cancelBy)}`}</span></p>` : ""}
    ${b.type === "flight" ? section("", `<div class="list">${row({ act: "go", attrs: 'data-href="#jetlag"', lead: icon("clock", 20), title: "Décalage horaire", sub: "Lumière, sommeil, mélatonine jour par jour", trail: icon("chev", 18) })}</div>`) : ""}
    ${b.address ? section("Adresse", `<div class="list">${row({ act: "copy", attrs: `data-text="${esc(b.address)}"`, title: esc(b.address), trail: icon("copy", 18) })}</div>`) : ""}
    ${details.length ? section("Détails", `<dl class="dl">${details.map(x => `<div><dt>${x[0]}</dt><dd>${esc(x[1])}</dd></div>`).join("")}</dl>`) : ""}`;
}

// --- Carnet : idées · budget · notes ---
function renderNotebook() {
  const sub = S.route.sub || "ideas";
  const add = { ideas: ["addIdea", "Nouvelle idée"], budget: ["addExpense", "Nouvelle dépense"], notes: ["addNote", "Nouvelle note"] }[sub];
  topbar({ title: "Carnet", right: tbBtn(add[0], "plus", add[1]) });
  const seg = `<div class="seg" role="tablist">${[["ideas", "Idées"], ["budget", "Budget"], ["notes", "Notes"]].map(o => `<button type="button" role="tab" aria-selected="${sub === o[0]}" class="${sub === o[0] ? "active" : ""}" data-go="#notebook/${o[0]}" data-replace="1">${o[1]}</button>`).join("")}</div>`;
  return largeTitle("Carnet") + seg + ({ ideas: renderIdeas, budget: renderBudget, notes: renderNotes }[sub])();
}
const BK_CAT = { hotel: "Logements", train: "Transports", flight: "Vols", activity: "Activités" }; // poste budgétaire d'une réservation
const PLATFORM = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube", maps: "Maps", web: "Lien" };
function renderIdeas() {
  const all = (S.data.ideas || []).slice().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  if (!all.length) return `<div class="empty">${icon("spark", 34)}<h3>Gardez vos envies ici</h3><p>Un Reel ou un TikTok qui vous tente ? Partagez-le vers « ${esc(S.data.trip.title || "Carnet de voyage")} » depuis l'app, ou collez le lien.</p><button class="btn" data-act="pasteIdea">${icon("paste", 18)} Coller un lien</button></div>`;
  const cities = [...new Set(all.map(i => i.city).filter(Boolean))];
  const f = S.ideaFilter || "all";
  const list = all.filter(i => f === "all" ? i.status !== "done" : f === "done" ? i.status === "done" : f === "unplaced" ? !i.city && i.status !== "done" : i.city === f && i.status !== "done");
  return `<div class="chips scroll">${[["all", "À faire"], ["unplaced", "À placer"], ...cities.map(c => [c, c]), ["done", "Faites"]].map(o => `<button type="button" class="chip${f === o[0] ? " on" : ""}" data-ideafilter="${esc(o[0])}">${esc(o[1])}</button>`).join("")}</div>
    ${list.length ? `<div class="ideas">${list.map(ideaCard).join("")}</div>` : `<p class="empty-inline">Rien ici.</p>`}`;
}
function ideaCard(i) {
  const day = i.dayId ? S.data.days.find(d => d.id === i.dayId) : null;
  const meta = [PLATFORM[i.platform] || "Lien", i.city || "À placer"].join(" · ");
  return `<button type="button" class="idea${i.status === "done" ? " done" : ""}" data-act="ideaMenu" data-id="${esc(i.id)}">
    <span class="thumb">${i.thumb ? `<img src="${esc(i.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : icon("link", 26)}</span>
    <span class="body"><span class="s">${esc(meta)}</span><span class="t clamp2">${esc(i.title || i.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60))}</span>${i.note ? `<span class="s clamp2">${esc(i.note)}</span>` : ""}
    <span class="meta">${i.status === "done" ? badge("Fait", "green") : day ? badge(`Prévu le ${fmtDay(day.date)}`, "blue") : ""}</span></span></button>`;
}
function renderBudget() {
  const b = S.data.budget || { items: [] };
  const cats = b.categories || b.items.map(i => i.label);
  const exps = (S.data.expenses || []).slice().sort((x, y) => (y.date + (y.createdAt || "")).localeCompare(x.date + (x.createdAt || "")));
  // dépensé = dépenses saisies sur place + réservations confirmées (payées ou engagées), par poste
  const realBy = {}, bookedBy = {};
  exps.forEach(e => { realBy[e.category || "Autre"] = (realBy[e.category || "Autre"] || 0) + toHome(e); });
  const booked = S.data.bookings.filter(x => x.status === "confirmed" && +x.price > 0);
  booked.forEach(x => { const c = BK_CAT[x.type] || "Autre"; bookedBy[c] = (bookedBy[c] || 0) + +x.price; realBy[c] = (realBy[c] || 0) + +x.price; });
  const realTotal = Object.values(realBy).reduce((s, v) => s + v, 0);
  const planned = b.items.reduce((s, i) => s + (+i.amount || 0), 0); // prévu = somme des postes saisis
  const left = planned - realTotal, pct = planned ? Math.min(100, Math.round(realTotal / planned * 100)) : 0;
  const bookedOf = t => booked.filter(x => x.type === t).reduce((s, x) => s + +x.price, 0);
  const missingPrice = S.data.bookings.filter(x => x.status === "confirmed" && x.type === "flight" && !(+x.price > 0));
  const extra = [...new Set([...cats, ...Object.keys(realBy)])].filter(c => !b.items.some(i => i.label === c) && realBy[c]);
  const catRow = (label, plan, real, idx) => { const p = plan ? Math.min(100, Math.round(real / plan * 100)) : 100; return `<button type="button" class="cat" ${idx != null ? `data-act="editBudgetItem" data-idx="${idx}"` : "disabled"}><span class="cat-top"><span>${esc(label)}${bookedBy[label] ? `<small>dont ${money(bookedBy[label])} de résas</small>` : ""}</span><span><b>${money(real)}</b>${plan ? ` / ${money(plan)}` : ""}</span></span><span class="bar${real > plan && plan ? " over" : ""}"><i style="width:${p}%"></i></span></button>`; };
  const byDay = {}; exps.forEach(e => (byDay[e.date] = byDay[e.date] || []).push(e));
  return `<div class="hero calm"><span class="eyebrow">Reste</span><div class="big">${money(left)}</div><p>${money(realTotal)} dépensés sur ${money(planned)} prévus</p><span class="bar"><i style="width:${pct}%"></i></span></div>
    ${section("Par poste", `<div class="card cats">${b.items.map((i, idx) => catRow(i.label, +i.amount || 0, realBy[i.label] || 0, idx)).join("")}${extra.map(c => catRow(c, 0, realBy[c])).join("")}</div>`)}
    ${section("Dépenses", exps.length ? Object.keys(byDay).map(dt => `<p class="list-label">${fmtDow(dt)} ${fmtDay(dt)}</p><div class="list">${byDay[dt].map(expRow).join("")}</div>`).join("") : `<div class="list">${row({ act: "addExpense", lead: icon("plus", 20), title: "Ajouter une dépense", sub: localCur() ? "En devise locale : la conversion est automatique." : "", cls: "add" })}</div>`)}
    ${section("Déjà réservé", `<div class="list">${row({ lead: icon("plane", 20), title: "Vols", sub: missingPrice.length ? esc(missingPrice.map(x => x.name).join(", ")) + " : prix à renseigner" : "", trail: `<b class="amt">${money(bookedOf("flight"))}</b>` })}${row({ lead: icon("bed", 20), title: "Logements confirmés", trail: `<b class="amt">${money(bookedOf("hotel"))}</b>` })}${row({ lead: icon("train", 20), title: "Trains", trail: `<b class="amt">${money(bookedOf("train"))}</b>` })}</div>`)}
    <p class="footnote">${b.note ? esc(b.note) + "<br>" : ""}Les réservations confirmées comptent dans le dépensé de leur poste. ${localCur() ? `1 ${curSym(homeCur())} = ${rate()} ${curSym(localCur())} · ` : ""}<button class="link" data-act="editBudget">Modifier le budget</button></p>`;
}
const expRow = e => row({ act: "editExpense", attrs: `data-id="${esc(e.id)}"`, title: esc(e.label || e.category || "Dépense"), sub: esc([e.label && e.category, e.author].filter(Boolean).join(" · ")), trail: `<span class="amt">${fmtExp(e)}${isLocal(e) ? `<small>${money(toHome(e))}</small>` : ""}</span>` });
function renderNotes() {
  const notes = (S.data.notes || []).slice().reverse();
  if (!notes.length) return `<div class="empty">${icon("pen", 34)}<h3>Aucune note</h3><p>Vous et votre assistant pouvez écrire ici.</p><button class="btn" data-act="addNote">Écrire une note</button></div>`;
  return `<div class="notes">${notes.map(n => `<button type="button" class="note" data-act="editNote" data-id="${esc(n.id)}"><span class="meta">${esc(n.author || "Moi")}${n.via === "partage" ? " (lien partagé)" : ""} · ${fmtWhen(n.createdAt)}${n.dayId ? " · " + fmtDay(n.dayId) : ""}</span><span class="txt">${esc(n.text)}</span></button>`).join("")}</div>`;
}

// --- Carte ---
// Lieux = étapes regroupées par ville (« Paris » et « Paris #2 » ensemble). Dans un lieu : logement + activités positionnées, une couleur par jour.
// Position : champ optionnel `geo: {lat, lng}` sur les jours (centre du lieu), les logements et les activités.
const DAY_COLORS = ["#d1495b", "#2a9d8f", "#e0871f", "#4c6ef5", "#8e5aa8", "#6a994e", "#c2185b", "#3d7ea6"];
const hasGeo = o => !!(o && o.geo && isFinite(+o.geo.lat) && isFinite(+o.geo.lng));
const ll = o => [+o.geo.lat, +o.geo.lng];
const MAP = { el: null, map: null, layer: null, markers: {}, pins: {}, fitKey: "", loading: null, fromRoute: "", ready: false, me: null };
const PEEK = 140; // hauteur du panneau replié (= --peek en CSS)
const anim = () => !matchMedia("(prefers-reduced-motion: reduce)").matches;
const TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
function mapPlaces() {
  const out = [];
  for (const s of stages()) {
    let p = out.find(x => x.key === s.key);
    if (!p) { p = { key: s.key, city: s.city.replace(/\s*#\d+$/, ""), days: [], lodgings: [] }; out.push(p); }
    p.days.push(...s.days);
    if (s.lodging && !p.lodgings.includes(s.lodging)) p.lodgings.push(s.lodging);
  }
  for (const p of out) {
    p.color = id => DAY_COLORS[Math.max(0, p.days.findIndex(d => d.id === id)) % DAY_COLORS.length];
    p.pins = pinsOf(p);
    const c = p.days.find(hasGeo), act = p.pins.find(x => x.kind === "act");
    p.center = c ? ll(c) : act ? act.latlng : null;
  }
  return out.filter(p => p.center && (p.lodgings.length || p.pins.some(x => x.kind === "act")));
}
function pinsOf(p) {
  const pins = [];
  for (const b of p.lodgings) if (hasGeo(b)) pins.push({ id: "bk:" + b.id, kind: "hotel", title: b.name, latlng: ll(b), color: "", bk: b.id, todo: b.status !== "confirmed", sub: b.checkin ? `${fmtDay(b.checkin)} – ${fmtDay(b.checkout)}` : "" });
  for (const d of p.days) {
    for (const a of d.activities || []) if (hasGeo(a)) pins.push({ id: `act:${d.id}:${a.id}`, kind: "act", title: a.title, latlng: ll(a), color: p.color(d.id), day: d, done: !!a.done, booking: a.booking });
    for (const b of S.data.bookings || []) if (b.type === "activity" && b.checkin === d.date && hasGeo(b)) pins.push({ id: "bk:" + b.id, kind: "act", title: b.name, latlng: ll(b), color: p.color(d.id), day: d, bk: b.id, sub: b.checkinTime || "", todo: b.status !== "confirmed" });
  }
  return pins;
}
function renderMap() {
  const r = S.route, ps = mapPlaces();
  if (r.id && r.id !== MAP.fromRoute) { MAP.fromRoute = r.id; const p = ps.find(x => x.days.some(d => d.id === r.id)); if (p) S.map = { place: p.key, day: r.id }; }
  topbar({ title: "Carte" });
  const p = ps.find(x => x.key === S.map.place);
  const chips = `<nav class="map-places" aria-label="Lieux"><button type="button" data-act="mapPlace" data-key="" class="${!p ? "current" : ""}">Tout</button>${ps.map((x, i) => `<button type="button" data-act="mapPlace" data-key="${esc(x.key)}" class="${p === x ? "current" : ""}"><small>${i + 1}</small>${esc(x.city)}</button>`).join("")}</nav>`;
  const locate = "geolocation" in navigator ? `<button type="button" class="map-locate" data-act="locate" aria-label="Ma position">${icon("locate", 22)}</button>` : "";
  return `<div class="mapwrap${MAP.ready ? " ready" : ""}">${chips}<div class="map-slot"></div>${locate}${p ? mapPanel(p) : ""}</div>`;
}
function mapPanel(p) {
  const sel = S.map.day, first = p.days[0], last = p.days[p.days.length - 1];
  const legend = p.days.map(d => `<button type="button" class="daychip${sel === d.id ? " on" : ""}" data-act="mapDay" data-id="${esc(d.id)}" style="--c:${p.color(d.id)}" aria-pressed="${sel === d.id}"><i></i>${fmtDow(d.date)} ${parseISO(d.date).getDate()}</button>`).join("");
  const lodg = p.lodgings.map(b => row({ act: hasGeo(b) ? "mapFocus" : "openBk", attrs: hasGeo(b) ? `data-pin="bk:${esc(b.id)}"` : `data-id="${esc(b.id)}"`, lead: icon("bed", 20), title: esc(b.name), sub: esc([b.checkin && `${fmtDay(b.checkin)} – ${fmtDay(b.checkout)}`, b.address].filter(Boolean).join(" · ")), trail: (b.status !== "confirmed" ? badge("À réserver", "red") : hasGeo(b) ? "" : badge("Sans position")) + icon("chev", 18) })).join("");
  const days = (sel ? p.days.filter(d => d.id === sel) : p.days).map(d => {
    const acts = (d.activities || []).map(a => {
      const pin = hasGeo(a);
      return row({ act: pin ? "mapFocus" : "", attrs: pin ? `data-pin="act:${esc(d.id)}:${esc(a.id)}"` : "", cls: (a.done ? "done " : "") + (pin ? "" : "nopin"), lead: `<i class="dot${pin ? "" : " off"}" style="--c:${p.color(d.id)}"></i>`, title: esc(a.title), trail: a.done ? "" : a.booking === "yes" ? badge("À réserver", "red") : a.booking === "maybe" ? badge("À vérifier", "amber") : "" });
    }).join("");
    return `<p class="list-label"><i class="dot" style="--c:${p.color(d.id)}"></i><span>${fmtDow(d.date)} ${fmtDay(d.date)} · ${esc(d.title)}</span><button type="button" class="link" data-go="#day/${esc(d.id)}">Journée</button></p><div class="list">${acts || `<p class="empty-inline">Rien de prévu.</p>`}</div>`;
  }).join("");
  return `<div class="map-panel ${S.map.sheet}"><button type="button" class="map-panel-head" data-act="mapSheet" aria-expanded="${S.map.sheet !== "peek"}"><span class="grab" aria-hidden="true"></span><span class="head-text"><strong class="ttl">${esc(p.city)}</strong><span class="sub">${fmtDay(first.date)}${last !== first ? " – " + fmtDay(last.date) : ""} · ${p.days.length} jour${p.days.length > 1 ? "s" : ""}${p.pins.length ? ` · ${p.pins.length} lieu${p.pins.length > 1 ? "x" : ""}` : ""}</span></span></button><button type="button" class="iconbtn map-close" data-act="mapPlace" data-key="" aria-label="Fermer">${icon("close", 20)}</button>
    <div class="daychips">${legend}</div>
    ${lodg ? `<div class="list">${lodg}</div>` : ""}${days}</div>`;
}
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  if (!MAP.loading) MAP.loading = new Promise((res, rej) => {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "vendor/leaflet/leaflet.css?" + ASSET_Q; document.head.appendChild(css);
    const sc = document.createElement("script"); sc.src = "vendor/leaflet/leaflet.js?" + ASSET_Q; sc.onload = res; sc.onerror = () => { MAP.loading = null; rej(new Error("Leaflet")); }; document.head.appendChild(sc);
  });
  return MAP.loading;
}
// la carte Leaflet vit dans un élément conservé entre deux rendus (déplacé dans la vue, jamais recréé)
async function mountMap() {
  const slot = $("#view .map-slot"); if (!slot) return;
  if (!MAP.el) { MAP.el = document.createElement("div"); MAP.el.className = "map"; }
  slot.appendChild(MAP.el);
  if (!window.L) {
    try { await loadLeaflet(); } catch (_) { slot.innerHTML = `<div class="empty">${icon("map", 32)}<p>Carte indisponible hors ligne.</p></div>`; return; }
    if (!document.contains(slot)) return;
  }
  if (!MAP.map) {
    MAP.map = L.map(MAP.el, { zoomControl: !isTouch, attributionControl: false, zoomSnap: .25 });
    const tiles = L.tileLayer(TILES, { maxZoom: 18 }).addTo(MAP.map);
    const ready = () => { MAP.ready = true; $("#view .mapwrap")?.classList.add("ready"); };
    tiles.once("load", ready);
    tiles.on("tileerror", () => { ready(); if (!navigator.onLine && !MAP.offlineToast) { MAP.offlineToast = true; toast("Fond de carte indisponible hors ligne"); } });
    MAP.map.on("dragstart", () => { if (S.map.sheet !== "peek" && $("#view .map-panel")) setSheet("peek"); });
    L.control.attribution({ position: "topright", prefix: false }).addAttribution('Tiles © <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a>').addTo(MAP.map);
    MAP.layer = L.layerGroup().addTo(MAP.map);
    MAP.map.on("zoomend", () => MAP.el.classList.toggle("labels-on", MAP.map.getZoom() >= 14));
  }
  MAP.map.invalidateSize();
  drawMarkers();
  bindSheet();
  $("#view .map-places .current")?.scrollIntoView({ inline: "center", block: "nearest" });
  $("#view .daychip.on")?.scrollIntoView({ inline: "center", block: "nearest" });
}
// panneau à deux positions : ouvert (46 %) ou replié (en-tête + jours) ; appui sur l'en-tête ou glissement vertical
function setSheet(st) {
  S.map.sheet = st;
  const p = $("#view .map-panel"); if (!p) return;
  p.classList.toggle("peek", st === "peek"); p.classList.toggle("open", st !== "peek");
  p.querySelector(".map-panel-head")?.setAttribute("aria-expanded", st !== "peek");
  if (st === "peek") p.scrollTop = 0;
}
function bindSheet() {
  const p = $("#view .map-panel"); if (!p) return;
  let y0 = null, dy = 0;
  p.addEventListener("touchstart", e => { y0 = null; dy = 0; if (S.map.sheet === "peek" || p.scrollTop === 0 || e.target.closest(".map-panel-head")) y0 = e.touches[0].clientY; }, { passive: true });
  p.addEventListener("touchmove", e => { if (y0 != null) dy = e.touches[0].clientY - y0; }, { passive: true });
  p.addEventListener("touchend", () => { if (y0 == null) return; if (dy > 40 && S.map.sheet !== "peek") setSheet("peek"); else if (dy < -40 && S.map.sheet === "peek") setSheet("open"); y0 = null; }, { passive: true });
}
const panelHeight = () => { const p = $("#view .map-panel"); return !p ? 0 : S.map.sheet === "peek" ? PEEK : Math.round(p.parentElement.clientHeight * .46); };
function openPin(id) {
  const m = MAP.markers[id], pin = MAP.pins[id]; if (!m || !pin) return;
  MAP.map.openPopup(L.popup({ closeButton: false, offset: [0, pin.kind === "hotel" ? -18 : -14], className: "mk-popup", autoPanPaddingTopLeft: L.point(16, 64), autoPanPaddingBottomLeft: L.point(16, panelHeight() + 16) }).setLatLng(m.getLatLng()).setContent(popupHtml(pin)));
}
// position de l'utilisateur : point bleu + recentrage
function locateMe() {
  toast("Recherche de la position…");
  navigator.geolocation.getCurrentPosition(pos => {
    const at = [pos.coords.latitude, pos.coords.longitude];
    if (!MAP.me) { MAP.me = L.layerGroup().addTo(MAP.map); }
    MAP.me.clearLayers();
    L.circle(at, { radius: Math.min(pos.coords.accuracy || 0, 500), color: "#2b7de9", weight: 1, fillOpacity: .12, interactive: false }).addTo(MAP.me);
    L.marker(at, { icon: L.divIcon({ className: "mk", html: '<div class="mk-me"></div>', iconSize: [44, 44], iconAnchor: [22, 22] }), keyboard: false, interactive: false }).addTo(MAP.me);
    const z = Math.max(MAP.map.getZoom(), 15), pt = MAP.map.project(at, z).add([0, panelHeight() / 2 - 20]);
    MAP.map.setView(MAP.map.unproject(pt, z), z, { animate: anim() });
  }, () => toast("Position indisponible", true), { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
}
const svgIcon = n => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;
function pinIcon(pin, on) {
  if (pin.kind === "hotel") return L.divIcon({ className: "mk", html: `<div class="mk-hotel${pin.todo ? " todo" : ""}">${svgIcon("bed")}</div>`, iconSize: [44, 44], iconAnchor: [22, 22] });
  return L.divIcon({ className: "mk", html: `<div class="mk-act${pin.done ? " done" : ""}${on ? "" : " dim"}" style="--c:${pin.color}">${parseISO(pin.day.date).getDate()}</div>`, iconSize: [44, 44], iconAnchor: [22, 22] });
}
function popupHtml(pin) {
  const [lat, lng] = pin.latlng;
  const head = pin.day ? `<span class="mk-day" style="--c:${pin.color}"><i></i>${fmtDow(pin.day.date)} ${fmtDay(pin.day.date)}</span>` : `<span class="mk-day">${pin.todo ? "Logement à réserver" : "Logement"}</span>`;
  const links = [pin.day && `<a href="#day/${esc(pin.day.id)}">Journée</a>`, pin.bk && `<a href="#bk/${esc(pin.bk)}">Résa</a>`, `<a href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}" target="_blank" rel="noopener">Y aller ${icon("external", 14)}</a>`].filter(Boolean).join("");
  return `<div class="mk-pop">${head}<b>${esc(pin.title)}</b>${pin.sub ? `<span class="s">${esc(pin.sub)}</span>` : ""}<div class="mk-links">${links}</div></div>`;
}
function drawMarkers() {
  const ps = mapPlaces(), p = ps.find(x => x.key === S.map.place);
  MAP.layer.clearLayers(); MAP.markers = {};
  ps.forEach((x, i) => {
    if (x === p) return;
    L.marker(x.center, { icon: L.divIcon({ className: "mk", html: `<div class="mk-place">${i + 1}</div>`, iconSize: [44, 44], iconAnchor: [22, 22] }), keyboard: false, title: x.city })
      .on("click", () => actions.mapPlace({ dataset: { key: x.key } })).addTo(MAP.layer);
  });
  MAP.pins = {};
  if (p) for (const pin of p.pins) {
    const on = !S.map.day || pin.kind === "hotel" || pin.day.id === S.map.day;
    const m = L.marker(pin.latlng, { icon: pinIcon(pin, on), zIndexOffset: pin.kind === "hotel" ? 1000 : on ? 500 : 0, keyboard: false, title: pin.title });
    m.on("click", () => openPin(pin.id));
    m.bindTooltip(esc(pin.title), { permanent: true, direction: "right", offset: [pin.kind === "hotel" ? 18 : 15, 0], className: "mk-label" + (pin.kind === "hotel" ? " hotel" : "") + (on ? "" : " dim"), opacity: 1 });
    m.addTo(MAP.layer); MAP.markers[pin.id] = m; MAP.pins[pin.id] = pin;
  }
  const ph = panelHeight();
  MAP.el.classList.toggle("labels-on", MAP.map.getZoom() >= 14);
  // recadrage seulement quand la sélection change (pas à chaque synchro)
  const key = (S.map.place || "all") + "/" + S.map.day;
  if (key === MAP.fitKey) return;
  const pad = { paddingTopLeft: L.point(28, 96), paddingBottomRight: L.point(28, ph + 28), animate: !!MAP.fitKey && anim() };
  MAP.fitKey = key;
  if (!p) { const pts = ps.map(x => x.center); if (pts.length) MAP.map.fitBounds(L.latLngBounds(pts), { ...pad, maxZoom: 8 }); return; }
  let pts = p.pins.filter(x => !S.map.day || x.kind === "hotel" || x.day.id === S.map.day).map(x => x.latlng);
  if (!pts.length) pts = p.pins.map(x => x.latlng);
  if (pts.length > 1) MAP.map.fitBounds(L.latLngBounds(pts), { ...pad, maxZoom: 15 });
  else MAP.map.setView(pts[0] || p.center, 13);
}
// depuis la liste : replier le panneau, centrer le point dans la zone visible et ouvrir sa bulle
function focusPin(id) {
  const m = MAP.markers[id]; if (!m || !MAP.map) return;
  setSheet("peek");
  const z = Math.max(MAP.map.getZoom(), 15), pt = MAP.map.project(m.getLatLng(), z).add([0, panelHeight() / 2 - 20]);
  MAP.map.setView(MAP.map.unproject(pt, z), z, { animate: anim() });
  if (anim()) MAP.map.once("moveend", () => openPin(id)); else openPin(id);
}

// --- Décalage horaire ---
// Plan anti-jet lag calculé sur le téléphone, d'après Eastman & Burgess (2009, Sleep Medicine Clinics), la base
// scientifique commune aux apps de jet lag : l'horloge interne est repérée par le minimum de température (Tmin,
// ~3 h avant le lever habituel). Lumière après Tmin = avance, lumière avant = retard. Vers l'est on avance
// (1 h/jour), vers l'ouest on retarde (1,5 h/jour). Mélatonine 0,5 mg ~9 h avant Tmin (avance seulement).
// Le sommeil reste possible de Tmin − 7 h à Tmin + 7 h : on y cale la nuit souhaitée. Préférences : localStorage.
const JL_KEY = "tripJetlag";
const JL_DEF = { bed: "23:00", wake: "07:00", chrono: "mid", pre: 2, mel: "yes", caf: "yes" };
const JL_ICON = { light: "sun", avoid: "glasses", sleep: "moon", nap: "moon", mel: "pill", caf: "coffee", flight: "plane", layover: "clock" };
const H = 3600000;
const toH = t => { const [h, m] = String(t || "0:0").split(":").map(Number); return (h || 0) + (m || 0) / 60; };
const jlPrefs = () => { try { return { ...JL_DEF, ...JSON.parse(localStorage.getItem(JL_KEY) || "{}") }; } catch (_) { return { ...JL_DEF }; } };
const tzParts = (ms, tz) => { const o = {}; new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(new Date(ms)).forEach(p => o[p.type] = p.value); return o; };
const tzOffset = (ms, tz) => { const o = tzParts(ms, tz); return Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute, +o.second) - ms; };
// heure locale (date ISO + « HH:MM », ± jours) dans un fuseau → instant
function zoned(date, time, tz, dayDelta = 0) { const [y, m, d] = date.split("-").map(Number); const [hh, mm] = String(time || "00:00").split(":").map(Number); const g = Date.UTC(y, m - 1, d + dayDelta, hh, mm); const r = g - tzOffset(g, tz); return g - tzOffset(r, tz); }
const tzDate = (ms, tz) => { const o = tzParts(ms, tz); return `${o.year}-${String(o.month).padStart(2, "0")}-${String(o.day).padStart(2, "0")}`; };
const nextMidnight = (ms, tz) => zoned(tzDate(ms, tz), "00:00", tz, 1);
const fmtT = (ms, tz) => new Intl.DateTimeFormat("fr-FR", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));
const fmtD = (ms, tz) => new Intl.DateTimeFormat("fr-FR", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(new Date(ms));
const hours = ms => String(Math.round(ms / H * 2) / 2).replace(".", ",") + " h";
// nuits mesurées (collection `sleep`, remplie par une montre connectée via l'API) : instants UTC
const sleepSrc = r => r?.src ? r.src.charAt(0).toUpperCase() + r.src.slice(1) : "montre";
const jlNights = () => (S.data.sleep || []).map(r => ({ s: Date.parse(r.start), e: Date.parse(r.end), score: r.score, src: r.source })).filter(r => r.e > r.s).sort((a, b) => a.s - b.s);
// horaire habituel mesuré : médiane des 21 nuits avant le plan, dans le fuseau de départ (≥ 5 nuits)
function jlMeasured(leg, start) {
  const ns = jlNights().filter(r => r.e <= start && r.e > start - 21 * 86400000);
  if (ns.length < 5) return null;
  const med = a => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
  const hh = (ms, base) => (toH(fmtT(ms, leg.fromTz)) - base + 24) % 24;
  const q = h => Math.round(h * 4) / 4; // au quart d'heure
  const bed = q(med(ns.map(r => hh(r.s, 18))) + 18) % 24, wake = q(med(ns.map(r => hh(r.e, 0))));
  const t = h => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
  return { bed: t(bed), wake: t(wake), n: ns.length };
}
// Toutes les heures affichées sont à l'heure de la maison (trip.home / trip.homeTz) : une seule référence pour ne pas se perdre.
const jlHomeTz = () => S.data.trip.homeTz || Intl.DateTimeFormat().resolvedOptions().timeZone;
const jlHome = () => S.data.trip.home || "Maison";
// vols aller / retour : le premier vol part du fuseau de départ (trip.homeTz), le dernier en revient
function jlLegs() {
  const home = jlHomeTz(), dest = S.data.trip.tz || home;
  const fl = (S.data.bookings || []).filter(b => b.type === "flight" && b.checkin && b.checkinTime && b.checkoutTime).sort((a, b) => a.checkin.localeCompare(b.checkin));
  if (!fl.length) return [];
  const city = x => String(x || "").replace(/\s*\(.*$/, "").trim();
  const mk = (b, fromTz, toTz, key) => {
    const l = { key, bk: b, fromTz, toTz, dep: zoned(b.checkin, b.checkinTime, fromTz), arr: zoned(b.checkout || b.checkin, b.checkoutTime, toTz), from: city(b.from || "Départ"), to: city(b.to || "Arrivée") };
    // tronçons (booking.legs : vol, from, to, dep, depTime, depTz, arr, arrTime, arrTz) ; sinon un seul tronçon
    const segs = (b.legs || []).map(x => ({ s: zoned(x.dep, x.depTime, x.depTz || fromTz), e: zoned(x.arr, x.arrTime, x.arrTz || toTz), from: city(x.from), to: city(x.to), flight: x.flight || "" })).filter(x => x.e > x.s).sort((a, b) => a.s - b.s);
    l.segs = segs.length ? segs : [{ s: l.dep, e: l.arr, from: l.from, to: l.to, flight: "" }];
    if (segs.length) { l.dep = segs[0].s; l.arr = segs[segs.length - 1].e; }
    // où est-on à l'instant t : au sol, dans l'avion (tronçon) ou à l'escale (ville)
    l.where = t => { const f = l.segs.find(x => t >= x.s && t < x.e); if (f) return { k: "flight", seg: f }; if (t >= l.dep && t < l.arr) { const prev = l.segs.filter(x => x.e <= t).pop(); return { k: "layover", city: prev ? prev.to : "" }; } return { k: "ground" }; };
    l.cuts = [...new Set(l.segs.flatMap(x => [x.s, x.e]))].sort((a, b) => a - b);
    return l;
  };
  const legs = [mk(fl[0], home, dest, "out")];
  if (fl.length > 1) legs.push(mk(fl[fl.length - 1], dest, home, "back"));
  return legs.filter(l => l.arr > l.dep);
}
function jlPlan(leg, p) {
  let total = (tzOffset(leg.arr, leg.toTz) - tzOffset(leg.arr, leg.fromTz)) / H; // > 0 : vers l'est
  if (total > 12) total -= 24; if (total <= -12) total += 24;
  const need = Math.abs(total); if (need < 1) return null;
  const east = total > 0, dir = east ? -1 : 1; // avance = Tmin plus tôt
  const rate = east ? (p.chrono === "owl" ? .75 : 1) : (p.chrono === "lark" ? 1.25 : 1.5);
  const off = { lark: 3.5, mid: 3, owl: 2.5 }[p.chrono] || 3;
  const pre = Math.min(Math.max(0, +p.pre || 0), Math.ceil(need / rate) - 1);
  const depDate = tzDate(leg.dep, leg.fromTz);
  const start = zoned(depDate, "00:00", leg.fromTz, -pre); // minuit local, `pre` jours avant le vol
  const measured = jlMeasured(leg, start), base = measured && p.src !== "manual" ? measured : p;
  const bedH = toH(base.bed), wakeH = toH(base.wake), sleepLen = (((wakeH - bedH) % 24) + 24) % 24 || 8;
  const nights = Math.ceil(need / rate), real = jlNights();
  const shiftOf = n => dir * Math.min(need, rate * (n + 1)) * H;
  // Tmin de la nuit n (celle qui commence le jour start + n) : lever habituel − off, décalé progressivement
  const tmin0 = zoned(depDate, "00:00", leg.fromTz, 1 - pre) + (wakeH - off) * H;
  const tmin = n => tmin0 + n * 86400000 + shiftOf(n);
  const end = zoned(tzDate(tmin(nights - 1), leg.toTz), "00:00", leg.toTz, 1);
  const blocks = [];
  const add = (type, s, e, title, sub, done) => { if (e > s) blocks.push({ type, s, e, title, sub, done }); };
  const inFlight = (s, e) => leg.where((s + e) / 2).k !== "ground";
  let prevEnd = 0;
  for (let n = 0; n < nights; n++) {
    const T = tmin(n), landed = T >= leg.arr, tz = landed ? leg.toTz : leg.fromTz;
    // nuit souhaitée : horaire habituel (décalé avant l'atterrissage), la plus proche de Tmin, puis calée dans la fenêtre possible
    const shift = landed ? 0 : shiftOf(n), date = tzDate(T, tz);
    const ds = [-1, 0].map(k => zoned(date, base.bed, tz, k) + shift).reduce((a, b) => Math.abs(b + sleepLen * H / 2 - T) < Math.abs(a + sleepLen * H / 2 - T) ? b : a);
    const de = ds + sleepLen * H, fs = T - 7 * H, fe = T + 7 * H, min = Math.min(sleepLen, 7) * H;
    let s = Math.max(ds, fs), e = Math.min(de, fe);
    if (e - s < 5 * H) { if (ds + sleepLen * H / 2 < T) { s = fs; e = fs + min; } else { e = fe; s = fe - min; } }
    // pas de nuit à cheval sur le décollage (à l'aéroport 2 h 30 avant) ni sur l'atterrissage
    const airport = leg.dep - 2.5 * H;
    if (s < airport && e > airport) { if (airport - s >= 4 * H) e = airport; else { s = leg.dep + H; e = s + min; } }
    else if (s < leg.arr && e > leg.arr - H) { if (leg.arr - H - s >= 4 * H) e = leg.arr - H; else { s = leg.arr + 1.5 * H; e = s + min; } }
    // nuit réellement mesurée (montre) : elle remplace la nuit prévue
    const r = real.find(x => x.e > T - 8 * H && x.s < T + 8 * H);
    if (r) { s = r.s; e = r.e; }
    if (r) add("sleep", s, e, "Dormi", `${hours(e - s)} · ${sleepSrc(r)}${r.score ? ` · score ${r.score}` : ""}`, true);
    else add("sleep", s, e, "Dormir", hours(e - s));
    const awake = (a, b, type, title, sub) => { if (s > a) add(type, a, Math.min(b, s), title, sub); if (e < b && e > s) add(type, Math.max(a, e), b, title, sub); };
    if (east) {
      awake(Math.max(T - 6 * H, prevEnd), T, "avoid", "Évite la lumière vive", "Lunettes de soleil dehors, lumière tamisée dedans");
      awake(T, T + 4 * H, "light", "Lumière vive", "Dehors si possible, sinon près d'une fenêtre");
      if (p.mel === "yes") { const m = T - 9 * H; if (m >= start && (m < s || m >= e)) add("mel", m, m + 15 * 60000, "Mélatonine 0,5 mg", "Petite dose : elle avance l'horloge, elle n'endort pas"); }
    } else {
      awake(Math.max(T - 8 * H, prevEnd), T, "light", "Lumière vive", "Reste dans la lumière : dehors, lampes, écrans");
      awake(T, T + 4 * H, "avoid", "Évite la lumière vive", "Lunettes de soleil, lumière tamisée");
    }
    if (e - s < 6 * H) { const ns = T + 9 * H; if (ns > e + 2 * H) add("nap", ns, ns + H, "Sieste possible", "30 min maximum"); }
    if (p.caf === "yes") { const c = s - 8 * H; if (c > prevEnd && c >= start) add("caf", c, c + 15 * 60000, "Dernier café", "Plus de caféine dans les 8 h avant le coucher"); }
    prevEnd = e;
  }
  // découpage aux décollages / atterrissages : un libellé par lieu (sol, avion, escale)
  const LABEL = {
    sleep: { flight: ["Dors dans l'avion", "masque et bouchons d'oreilles"], layover: ["Repos à l'escale", "dors si tu peux, sinon lumière tamisée"] },
    nap: { flight: ["Sieste dans l'avion", "30 min maximum"], layover: ["Sieste à l'escale", "30 min maximum"] },
    light: { flight: ["Lumière vive", "Dans l'avion : hublot ouvert, écran lumineux"], layover: ["Lumière vive", "À l'escale : près des baies vitrées"] },
    avoid: { flight: ["Évite la lumière vive", "Dans l'avion : hublot fermé, masque"], layover: ["Évite la lumière vive", "À l'escale : lunettes de soleil, coin sombre"] },
  };
  const out = [];
  for (const b of blocks) {
    if (!LABEL[b.type] || b.done) { out.push(b); continue; }
    const cuts = [b.s, ...leg.cuts.filter(c => c > b.s && c < b.e), b.e];
    for (let i = 0; i < cuts.length - 1; i++) {
      const w = leg.where((cuts[i] + cuts[i + 1]) / 2), piece = { ...b, s: cuts[i], e: cuts[i + 1] };
      if (w.k !== "ground") { const [t, sub] = LABEL[b.type][w.k]; piece.title = t; piece.sub = w.k === "layover" && w.city ? sub.replace("l'escale", `l'escale ${/^[aeiouyAEIOUY]/.test(w.city) ? "d'" : "de "}${w.city}`) : sub; }
      if (b.type === "sleep" && w.k === "ground") piece.sub = hours(piece.e - piece.s);
      out.push(piece);
    }
  }
  blocks.length = 0; blocks.push(...out);
  const ht = jlHomeTz(), far = leg.fromTz === ht ? leg.toTz : leg.fromTz;
  leg.segs.forEach((x, i) => {
    const xTz = i === 0 ? leg.fromTz : (leg.bk.legs?.[i]?.depTz || far), yTz = i === leg.segs.length - 1 ? leg.toTz : (leg.bk.legs?.[i]?.arrTz || far);
    add("flight", x.s, x.e, `Vol${x.flight ? " " + x.flight : ""} · ${x.from} → ${x.to}`, `${fmtT(x.s, ht)} → ${fmtT(x.e, ht)} heure de ${jlHome()} · local : ${fmtT(x.s, xTz)} → ${fmtT(x.e, yTz)}`);
    const n = leg.segs[i + 1];
    if (n) add("layover", x.e, n.s, `Escale · ${x.to}`, `${hours(n.s - x.e)} · redécollage ${fmtT(n.s, ht)} heure de ${jlHome()}`);
  });
  blocks.sort((a, b) => a.s - b.s);
  const done = ms => { let d = 0; for (let n = 0; n < nights; n++) if (tmin(n) <= ms) d = Math.min(need, rate * (n + 1)); return d; };
  return { leg, east, need, rate, nights, pre, start, end, blocks, done, measured, base };
}
// cartes « journée » : minuit à minuit à l'heure de la maison, du début à la fin du plan
function jlSegments(plan) {
  const segs = [], tz = jlHomeTz(); let cur = zoned(tzDate(plan.start, tz), "00:00", tz);
  while (cur < plan.end) { const nm = nextMidnight(cur, tz); segs.push({ s: cur, e: nm, tz }); cur = nm; }
  return segs;
}
const jlPlans = () => { const p = jlPrefs(); return jlLegs().map(l => jlPlan(l, p)).filter(Boolean); };
// conseil en cours et suivant, dans le fuseau où l'on se trouve
function jlCurrent(plan, now) {
  const tz = jlHomeTz();
  const adv = plan.blocks.filter(b => b.type !== "flight" && b.type !== "layover");
  return { tz, cur: adv.find(b => b.s <= now && now < b.e), next: adv.find(b => b.s > now) };
}
// ligne d'accès depuis Aujourd'hui : plan en cours (ou à venir) et conseil du moment
function jlEntry() {
  const now = Date.now(), plans = jlPlans();
  const plan = plans.find(x => now >= x.start - 86400000 && now < x.end) || plans.find(x => x.start > now && x.start - now < 14 * 86400000);
  if (!plan) return "";
  let sub;
  if (now < plan.start) sub = `Plan ${plan.leg.key === "back" ? "retour" : "aller"} à partir du ${fmtD(plan.start, plan.leg.fromTz)}`;
  else { const c = jlCurrent(plan, now); const far = plan.leg.key === "back" ? plan.leg.fromTz : plan.leg.toTz, farCity = plan.leg.key === "back" ? plan.leg.from : plan.leg.to, both = t => `${fmtT(t, c.tz)} ${jlHome()} · ${fmtT(t, far)} ${farCity}`; sub = c.cur ? `${c.cur.title} jusqu'à ${both(c.cur.e)}` : c.next ? `Prochain : ${c.next.title} à ${both(c.next.s)}` : "Adaptation terminée"; }
  return `<div class="list">${row({ act: "go", attrs: 'data-href="#jetlag"', lead: icon("clock", 20), title: "Décalage horaire", sub: esc(sub), trail: icon("chev", 18) })}</div>`;
}
function renderJetlag() {
  topbar({ back: "Aujourd'hui", title: "Décalage horaire", right: tbBtn("editJetlag", "pen", "Mon sommeil") });
  const plans = jlPlans(), now = Date.now();
  if (!plans.length) return largeTitle("Décalage horaire") + `<div class="empty">${icon("plane", 32)}<h3>Aucun vol</h3><p>Ajoute un vol avec ses heures de départ et d'arrivée pour calculer le plan.</p></div>`;
  const key = S.jl || (plans.length > 1 && now >= plans[0].end ? "back" : "out");
  const plan = plans.find(x => x.leg.key === key) || plans[0];
  const L = plan.leg, dest = L.to, home = jlHome(), homeTz = jlHomeTz();
  const destTz = L.key === "back" ? L.fromTz : L.toTz, destCity = L.key === "back" ? L.from : L.to;
  const atDest = sg => L.key === "back" ? sg.s < L.dep : sg.e > L.arr; // la personne est à destination pendant cette journée
  const seg = plans.length > 1 ? `<div class="seg" role="tablist">${plans.map(x => `<button type="button" role="tab" aria-selected="${x === plan}" class="${x === plan ? "active" : ""}" data-act="jlLeg" data-key="${x.leg.key}">${x.leg.key === "back" ? "Retour" : "Aller"} · ${fmtD(x.leg.dep, x.leg.fromTz).replace(/^\S+\s/, "")}</button>`).join("")}</div>` : "";
  // en-tête : conseil du moment + avancement de l'horloge interne
  let hero;
  const c = jlCurrent(plan, now), doneH = plan.done(now), pct = Math.round(doneH / plan.need * 100);
  const last = jlNights().filter(x => x.e <= now && x.e > now - 86400000).pop();
  const bar = `<span class="bar"><i style="width:${pct}%"></i></span><div class="jl-progress"><span>Horloge interne</span><span>${doneH ? String(doneH).replace(".", ",") : 0} h sur ${plan.need} h</span></div>${last ? `<div class="jl-progress"><span>Nuit dernière · ${sleepSrc(last)}</span><span>${hours(last.e - last.s)} · ${fmtT(last.s, c.tz)} – ${fmtT(last.e, c.tz)}</span></div>` : ""}`;
  if (now < plan.start) hero = `<div class="hero calm jl"><span class="eyebrow">Le plan commence dans</span><div class="big">${Math.ceil((plan.start - now) / 86400000)}<small> jours</small></div><p>${fmtD(plan.start, homeTz)}${plan.pre ? ` · ${plan.pre} jour${plan.pre > 1 ? "s" : ""} de pré-adaptation avant le vol` : " · jour du vol"}</p></div>`;
  else if (now >= plan.end) hero = `<div class="hero calm jl"><span class="eyebrow">Terminé</span><div class="big">Horloge à l'heure de ${esc(dest)}</div><p>Plan suivi jusqu'au ${fmtD(plan.end - 1, homeTz)}</p></div>`;
  else hero = `<div class="hero calm jl"><span class="eyebrow">Maintenant · ${esc(home)} ${fmtT(now, homeTz)} · ${esc(destCity)} ${fmtT(now, destTz)}</span><div class="big">${esc(c.cur ? c.cur.title : "Rien de spécial")}</div><p>${esc(c.cur ? `jusqu'à ${fmtT(c.cur.e, homeTz)} (${fmtT(c.cur.e, destTz)} à ${destCity})` : "Vis à l'heure locale")}${c.next ? ` · ensuite ${esc(c.next.title.toLowerCase())} à ${fmtT(c.next.s, c.tz)}` : ""}</p>${bar}</div>`;
  const segs = jlSegments(plan), past = segs.filter(sg => sg.e <= now);
  const cards = segs.filter(sg => sg.e > now || S.jlPast).map(sg => {
    const inCard = plan.blocks.filter(b => b.s < sg.e && b.e > sg.s), items = [];
    // bandeaux de phase : vols, escales, et « au sol » les jours de voyage
    const phase = (t, ic, title, sub) => items.push({ t, h: 0, html: `<div class="jl-phase">${icon(ic, 18)}<span><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span></div>` });
    const travel = inCard.some(b => b.type === "flight" || b.type === "layover");
    for (const b of inCard) {
      if (b.type === "flight" || b.type === "layover") { phase(Math.max(b.s, sg.s), JL_ICON[b.type], b.title, b.sub); continue; }
      const isNow = b.s <= now && now < b.e, point = b.type === "mel" || b.type === "caf";
      const tt = tz => `<span class="jl-time${tz === homeTz ? "" : " alt"}"><b>${fmtT(b.s, tz)}</b>${point ? "" : `<small>${fmtT(b.e, tz)}</small>`}</span>`;
      items.push({ t: Math.max(b.s, sg.s), h: 1, html: row({ cls: `tl jl jl-${b.type}${isNow ? " now" : ""}${b.done ? " done" : ""}`, lead: tt(homeTz) + tt(destTz), title: `${icon(JL_ICON[b.type], 16)} ${esc(b.title)}${isNow ? " " + badge("Maintenant", "red") : ""}`, sub: esc(b.sub) }) });
    }
    if (travel) {
      const before = L.key === "back" ? destCity : home, after = L.key === "back" ? home : destCity;
      if (L.where(sg.s).k === "ground") phase(sg.s, "pin", `Au sol · ${sg.s < L.dep ? before : after}`, "");
      if (L.arr > sg.s && L.arr < sg.e) phase(L.arr, "pin", `Au sol · ${after}`, `atterrissage ${fmtT(L.arr, homeTz)} heure de ${home} · ${fmtT(L.arr, destTz)} à ${destCity}`);
    }
    items.sort((a, b) => a.t - b.t || a.h - b.h);
    const today = now >= sg.s && now < sg.e;
    const diff = Math.round((tzOffset(sg.s + 12 * H, destTz) - tzOffset(sg.s + 12 * H, homeTz)) / H);
    const colhead = `<div class="jl-colhead"><span>${esc(home)}</span><span>${esc(destCity)} ${diff > 0 ? "+" : ""}${diff} h</span></div>`;
    return `<section class="sec${today ? " jl-today" : ""}"><div class="sec-head"><h2>${fmtD(sg.s, homeTz)}${today ? " " + badge("Aujourd'hui", "red") : ""}</h2>${atDest(sg) ? `<span class="muted small">à ${esc(destCity)}</span>` : ""}</div><div class="list">${items.length ? colhead + items.map(x => x.html).join("") : `<p class="empty-inline">Rien de particulier : vis à l'heure locale.</p>`}</div></section>`;
  }).join("");
  const pastBtn = past.length && now < plan.end ? `<button type="button" class="disclosure" data-act="jlPast" aria-expanded="${!!S.jlPast}">${icon("chev", 18)}<span>Jours passés (${past.length})</span></button>` : "";
  return largeTitle("Décalage horaire", `${esc(L.from)} → ${esc(dest)} · ${plan.east ? "+" : "−"}${plan.need} h · ${plan.nights} nuits · toutes les heures sont à l'heure de ${esc(home)}`) + seg + hero + pastBtn + cards
    + `<p class="footnote">${plan.measured && plan.base === plan.measured ? `Horaires habituels mesurés par la montre sur ${plan.measured.n} nuits (coucher ${plan.measured.bed}, lever ${plan.measured.wake}). ` : ""}Lumière, sommeil, mélatonine et café calculés d'après Eastman &amp; Burgess (2009), la base scientifique des apps anti-jet lag. Ce n'est pas un avis médical : la mélatonine se discute avec un médecin.<br><button class="link" data-act="editJetlag">Modifier mon sommeil</button></p>`;
}

setInterval(() => { if (S.route.page === "jetlag" && $("#modal").hidden) render(); }, 60000);

// --- Réglages ---
async function renderSettings() {
  const perm = "Notification" in window ? Notification.permission : "unsupported";
  const pushOk = S.me?.push;
  let subscribed = false;
  try { const reg = await navigator.serviceWorker.ready; subscribed = !!(await reg.pushManager.getSubscription()); } catch (_) {}
  const pushLine = !("PushManager" in window) ? "Installez l'app sur l'écran d'accueil pour les recevoir" : !pushOk ? "Pas encore disponibles" : perm === "denied" ? "Refusées dans les réglages du téléphone" : subscribed ? "Activées sur ce téléphone" : "Désactivées";
  const canPush = ("PushManager" in window) && pushOk && perm !== "denied";
  openSheet(`<div class="sheet-body"><h3 class="sheet-title">Réglages</h3>
   <div class="list">
    <div class="row"><span class="body"><span class="t">Apparence</span></span><span class="trail"><span class="seg small">${[["auto", "Auto"], ["light", "Clair"], ["dark", "Nuit"]].map(o => `<button type="button" data-act="setTheme" data-theme="${o[0]}" class="${S.theme === o[0] ? "active" : ""}">${o[1]}</button>`).join("")}</span></span></div>
    <div class="row"><span class="body"><span class="t">Notifications</span><span class="s">${esc(pushLine)}</span></span>${canPush ? `<span class="trail"><button type="button" class="switch${subscribed ? " on" : ""}" role="switch" aria-checked="${subscribed}" data-act="${subscribed ? "pushOff" : "pushOn"}" aria-label="Notifications"><i></i></button></span>` : ""}</div>
    <a class="row" href="${withToken("api/calendar.ics")}" download><span class="body"><span class="t">Ajouter au calendrier</span><span class="s">Toutes les réservations confirmées</span></span><span class="trail">${icon("calendar", 20)}</span></a>
   </div>
   <details class="adv"><summary>Avancé</summary><p class="small muted">Une sauvegarde à chaque modification, les 50 dernières sont gardées.</p><div id="backups" class="list">${row({ title: "Chargement…" })}</div></details>
   <div class="list">${row({ act: "logout", title: `<span class="danger-text">Se déconnecter</span>`, sub: S.me?.name ? "Connecté en tant que " + esc(S.me.name) : "" })}</div>
  </div>`);
  const m = $("#modal"); m.onclick = e => { if (e.target === m) closeModal(); else delegate(e); };
  try {
    const list = await api("GET", "backups");
    const el = $("#backups"); if (!el) return;
    el.innerHTML = list.slice(0, 8).map(bk => { const mm = bk.name.match(/trip-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/); const label = mm ? `${mm[3]}/${mm[2]} à ${mm[4]}:${mm[5]}` : bk.name; return row({ title: label, sub: Math.round(bk.size / 1024) + " Ko", trail: `<button type="button" class="link" data-act="restore" data-name="${esc(bk.name)}">Restaurer</button>` }); }).join("") || row({ title: "Aucune sauvegarde pour l'instant." });
  } catch (_) { const el = $("#backups"); if (el) el.innerHTML = row({ title: "Indisponible hors ligne." }); }
}
function urlB64ToUint8Array(b64) { const pad = "=".repeat((4 - b64.length % 4) % 4); const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from([...raw].map(c => c.charCodeAt(0))); }
// confirmation en feuille (remplace confirm())
function confirmSheet(title, text, okLabel, danger = true) {
  return new Promise(resolve => {
    openSheet(`<div class="sheet-body"><h3 class="sheet-title">${esc(title)}</h3>${text ? `<p class="muted">${esc(text)}</p>` : ""}<div class="stack"><button type="button" class="btn block ${danger ? "danger solid" : ""}" data-ok>${esc(okLabel)}</button><button type="button" class="btn ghost block" data-no>Annuler</button></div></div>`, { onClose: r => resolve(!!r) });
    $("#modal [data-ok]").onclick = () => closeModal(true);
    $("#modal [data-no]").onclick = () => closeModal(false);
  });
}

// ---------- formulaires métier ----------
const TAGS = [["move", "Transfert"], ["book", "Résa requise"], ["slow", "Slow day"]];
const BOOKING_OPTS = [["no", "Libre"], ["maybe", "À vérifier"], ["yes", "À réserver"]];
const DAY_FIELDS = () => [
  { key: "date", label: "Date", type: "date" }, { key: "city", label: "Ville / étape" }, { key: "title", label: "Titre" }, { key: "summary", label: "Résumé", type: "textarea" },
  { key: "lodgingId", label: "Logement", type: "select", options: [["", "—"]].concat(S.data.bookings.filter(b => b.type === "hotel").map(b => [b.id, b.name])) },
  { key: "tags", label: "Type de journée", type: "tags", options: TAGS },
  { key: "cost", label: `Coût estimé${(S.data.trip.travelers || []).length > 1 ? ` pour ${S.data.trip.travelers.length}` : ""} (${curSym(homeCur())})`, type: "number", advanced: true }, { key: "weather", label: "Météo", advanced: true }, { key: "lodgingNote", label: "Note logement", advanced: true },
  { key: "route", label: "Trajet", advanced: true, placeholder: "Gare → hôtel" }, { key: "detail", label: "Détail du trajet", type: "textarea", advanced: true },
  { key: "tbooking", label: "Billet", type: "chips", options: [["none", "Sans résa"], ["recommended", "Conseillé"], ["required", "À réserver"], ["done", "Réservé"]], advanced: true }, { key: "tcost", label: "Coût du trajet", advanced: true }
];
const is = (...types) => v => types.includes(v.type);
const BOOKING_FIELDS = () => [
  { key: "type", label: "Type", type: "chips", options: [["hotel", "Logement"], ["train", "Train"], ["flight", "Vol"], ["activity", "Activité"]] },
  { key: "name", label: "Nom", placeholder: "Hôtel, train, vol…" },
  { key: "status", label: "Statut", type: "chips", options: [["confirmed", "Confirmé"], ["todo", "À réserver"]] },
  { key: "checkin", label: "Date", type: "date" },
  { key: "checkout", label: "Date de fin", type: "date", showIf: is("hotel", "flight") },
  { key: "hin", label: "Check-in", type: "time", showIf: is("hotel") }, { key: "hout", label: "Check-out", type: "time", showIf: is("hotel") },
  { key: "checkinTime", label: "Heure de départ", type: "time", showIf: is("train", "flight", "activity") },
  { key: "checkoutTime", label: "Heure d'arrivée", type: "time", showIf: is("train", "flight") },
  { key: "from", label: "De", showIf: is("train", "flight") }, { key: "to", label: "À", showIf: is("train", "flight") },
  { key: "dayId", label: "Journée", type: "day", showIf: is("train") },
  { key: "address", label: "Adresse", showIf: is("hotel", "activity") },
  { key: "ref", label: "Référence" },
  { key: "file", label: "Confirmation", type: "file" },
  { key: "cancelBy", label: "Annulation gratuite jusqu'au", type: "date", showIf: is("hotel", "activity") },
  { key: "price", label: `Prix (${curSym(homeCur())})`, type: "number" },
  { key: "car", label: "Voiture", advanced: true, showIf: is("train") }, { key: "seat", label: "Sièges", advanced: true, showIf: is("train", "flight") }, { key: "track", label: "Voie", advanced: true, showIf: is("train") },
  { key: "geoText", label: "Position GPS (lat, lng)", advanced: true, placeholder: "35.7180, 139.8016", showIf: is("hotel", "activity") },
  { key: "city", label: "Ville / étape", advanced: true }, { key: "pin", label: "Code PIN", advanced: true }, { key: "phone", label: "Téléphone", type: "tel", advanced: true },
  { key: "platform", label: "Réservé via", advanced: true }, { key: "room", label: "Chambre / classe", advanced: true }, { key: "meals", label: "Repas", advanced: true },
  { key: "notes", label: "Notes", type: "textarea", advanced: true }
];
// logement : check-in / check-out stockés dans checkinTime / checkoutTime
const geoToText = o => hasGeo(o) ? `${o.geo.lat}, ${o.geo.lng}` : "";
const parseGeo = t => { const m = String(t || "").match(/(-?\d+(?:[.,]\d+)?)\s*[,; ]\s*(-?\d+(?:[.,]\d+)?)/); return m ? { lat: +m[1].replace(",", "."), lng: +m[2].replace(",", ".") } : null; };
const bkToForm = b => ({ ...b, hin: b.checkinTime || "", hout: b.checkoutTime || "", geoText: geoToText(b) });
const formToBk = v => { const o = { ...v }; if (o.type === "hotel") { o.checkinTime = o.hin; o.checkoutTime = o.hout; } delete o.hin; delete o.hout; if (o.type !== "hotel" && o.type !== "flight") o.checkout = o.checkin; if ("geoText" in o) { o.geo = parseGeo(o.geoText); delete o.geoText; } return o; };
const TASK_FIELDS = [
  { key: "title", label: "Tâche" }, { key: "desc", label: "Détails", type: "textarea" },
  { key: "col", label: "État", type: "chips", options: [["todo", "À faire"], ["check", "À vérifier"], ["done", "Fait"]] },
  { key: "priority", label: "Priorité", type: "chips", options: [["normal", "Normale"], ["booking", "Réservation"], ["critical", "Urgente"]] },
  { key: "deadline", label: "Échéance", placeholder: "ex. avant le 8 oct." }
];
const expenseFields = () => [
  { key: "amount", label: "Montant", type: "number", big: true, placeholder: "0" },
  { key: "currency", label: "Devise", type: "chips", options: [localCur() && [localCur(), `${curSym(localCur())} ${localCur()}`], [homeCur(), `${curSym(homeCur())} ${homeCur()}`]].filter(Boolean) },
  { key: "category", label: "Catégorie", type: "chips", options: (S.data.budget.categories || ["Autre"]).map(c => [c, c]) },
  { key: "label", label: "Libellé", placeholder: "Déjeuner, métro…" },
  { key: "date", label: "Date", type: "date", advanced: true }
];
const cityOptions = () => [["", "À placer"]].concat(stages().map(s => [s.city, s.city]).filter((v, i, a) => a.findIndex(x => x[0] === v[0]) === i));
const IDEA_FIELDS = () => [{ key: "url", label: "Lien", type: "url", placeholder: "https://" }, { key: "city", label: "Étape", type: "select", options: cityOptions() }, { key: "note", label: "Pourquoi ça vous tente ?", type: "textarea" }, { key: "title", label: "Titre", placeholder: "Récupéré automatiquement", advanced: true }];
const dayToForm = d => ({ ...d, tags: d.tags || [], lodgingId: d.lodging?.bookingId || "", lodgingNote: d.lodging?.note || "", route: d.transport?.route || "", detail: d.transport?.detail || "", tbooking: d.transport?.booking || "none", tcost: d.transport?.cost || "" });
const formToDay = v => ({ date: v.date, city: v.city, title: v.title, summary: v.summary, cost: v.cost, weather: v.weather, tags: v.tags, lodging: { bookingId: v.lodgingId, note: v.lodgingNote }, transport: { route: v.route, detail: v.detail, booking: v.tbooking, cost: v.tcost } });
const findDay = id => S.data.days.find(d => d.id === id);

const actions = {
  back() { goBack(); },
  go(el) { go(el.dataset.href); },
  settings() { renderSettings(); },
  openBk(el) { go("#bk/" + el.dataset.id); },
  toggleClamp(el) { el.classList.toggle("expanded"); },
  toggleDone() { S.showDone = !S.showDone; render(); },
  togglePast() { S.showPast = !S.showPast; render(); },
  async copy(el) {
    try { await navigator.clipboard.writeText(el.dataset.text); toast("Copié"); } catch (_) { toast(el.dataset.text); }
  },
  openGuide(el) {
    const g = S.data.guides.find(x => x.id === el.dataset.id);
    openSheet(`<div class="sheet-head"><span></span><b>${esc(g.title || "Repères")}</b><button type="button" class="link" data-edit>Modifier</button></div><div class="sheet-body"><p class="prewrap guide-text">${esc(g.text)}</p></div>`);
    $("#modal [data-edit]").onclick = () => { closeModal(); setTimeout(() => actions.editGuide(g), 60); };
  },
  // tâches : cocher avec annulation
  toggleTask(el) {
    const t = S.data.tasks.find(x => x.id === el.dataset.id); const prev = t.col;
    const next = prev === "done" ? "todo" : "done";
    t.col = next; render();
    mutate(() => api("PATCH", "tasks/" + t.id, { col: next }));
    if (next === "done") toast("Tâche terminée", false, { label: "Annuler", run: () => mutate(() => api("PATCH", "tasks/" + t.id, { col: prev })) });
  },
  async editTask(el) {
    const t = S.data.tasks.find(x => x.id === el.dataset.id);
    const v = await form("Tâche", TASK_FIELDS, t, { onDelete: () => removeWithUndo("tasks", t, "Tâche supprimée") });
    if (v) mutate(() => api("PATCH", "tasks/" + t.id, v));
  },
  async addTask() {
    const v = await form("Nouvelle tâche", TASK_FIELDS, { priority: "normal", col: "todo" }, { submit: "Ajouter" });
    if (v && v.title) mutate(() => api("POST", "tasks", v), "Tâche ajoutée");
  },
  // journées
  toggleAct(el) {
    const day = findDay(el.dataset.day); const a = day.activities.find(x => x.id === el.dataset.id);
    a.done = !a.done; render();
    mutate(() => api("PATCH", "days/" + day.id, { activities: day.activities }));
  },
  dayMenu(el) {
    const d = findDay(el.dataset.id);
    const guide = (S.data.guides || []).find(g => cityKey(g.city) === cityKey(d.city));
    actionSheet(`${fmtDow(d.date)} ${fmtDay(d.date)}`, [
      { label: "Ajouter une activité", icon: "spark", run: () => actions.addAct({ dataset: { day: d.id } }) },
      { label: "Ajouter un billet de train", icon: "train", run: () => actions.addTrain({ dataset: { day: d.id } }) },
      { label: "Ajouter une dépense", icon: "wallet", run: () => actions.addExpense({ dataset: { date: d.date } }) },
      { label: "Ajouter une photo", icon: "camera", run: () => actions.addDayPhoto({ dataset: { id: d.id } }) },
      { label: d.notes ? "Modifier les notes" : "Ajouter une note", icon: "pen", run: () => actions.editDayNotes({ dataset: { id: d.id } }) },
      { label: guide ? "Modifier les repères " + d.city : "Ajouter des repères " + d.city, icon: "info", run: () => guide ? actions.editGuide(guide) : actions.addGuide(d.city) },
      { label: "Modifier la journée", icon: "calendar", run: () => actions.editDay({ dataset: { id: d.id } }) },
    ]);
  },
  async addAct(el) {
    const day = findDay(el.dataset.day);
    const v = await form("Nouvelle activité", [{ key: "title", label: "Activité" }, { key: "booking", label: "Réservation", type: "chips", options: BOOKING_OPTS }, { key: "geoText", label: "Position GPS (lat, lng)", advanced: true, placeholder: "35.7148, 139.7967" }], { booking: "no" }, { submit: "Ajouter", focus: "title" });
    if (!v || !v.title) return;
    const act = { id: "a" + Date.now().toString(36), title: v.title, booking: v.booking, done: false };
    const geo = parseGeo(v.geoText); if (geo) act.geo = geo;
    mutate(() => api("PATCH", "days/" + day.id, { activities: (day.activities || []).concat([act]) }), "Activité ajoutée");
  },
  async editDayNotes(el) {
    const day = findDay(el.dataset.id);
    const v = await form("Notes du " + fmtDay(day.date), [{ key: "notes", label: "Notes", type: "textarea" }], day, { focus: "notes" });
    if (v) mutate(() => api("PATCH", "days/" + day.id, { notes: v.notes }));
  },
  async editDay(el) {
    const day = findDay(el.dataset.id);
    const v = await form("Journée", DAY_FIELDS(), dayToForm(day), { onDelete: () => { removeWithUndo("days", day, "Journée supprimée"); goBack(); } });
    if (v) mutate(() => api("PATCH", "days/" + day.id, formToDay(v)));
  },
  async addDay() {
    const v = await form("Nouvelle journée", DAY_FIELDS(), { tbooking: "none", tags: [] }, { submit: "Ajouter" });
    if (!v || !v.date) return;
    mutate(() => api("POST", "days", { id: v.date, ...formToDay(v), activities: [], notes: "" }), "Journée ajoutée");
  },
  async addDayPhoto(el) {
    const day = findDay(el.dataset.id);
    try { const f = await uploadFile("jour-" + day.id); if (f) mutate(() => api("PATCH", "days/" + day.id, { photos: (day.photos || []).concat([f]) }), "Photo ajoutée"); }
    catch (e) { toast(e.message, true); }
  },
  // réservations
  bkMenu(el) {
    const b = booking(el.dataset.id);
    actionSheet(b.name, [
      { label: "Modifier", icon: "pen", run: () => actions.editBooking({ dataset: { id: b.id } }) },
      b.ref && { label: "Copier la référence", icon: "copy", run: () => actions.copy({ dataset: { text: b.ref } }) },
      { label: "Supprimer", icon: "trash", danger: true, run: async () => { if (await confirmSheet("Supprimer cette réservation ?", b.name, "Supprimer")) { goBack(); removeWithUndo("bookings", b, "Réservation supprimée"); } } },
    ]);
  },
  async editBooking(el) {
    const b = booking(el.dataset.id);
    const v = await form("Réservation", BOOKING_FIELDS(), bkToForm(b));
    if (v) mutate(() => api("PATCH", "bookings/" + b.id, formToBk(v)));
  },
  async addBooking() {
    const v = await form("Nouvelle réservation", BOOKING_FIELDS(), { type: "hotel", status: "confirmed" }, { submit: "Ajouter" });
    if (v && v.name) mutate(() => api("POST", "bookings", formToBk(v)), "Réservation ajoutée");
  },
  async addTrain(el) {
    const day = findDay(el.dataset.day);
    const v = await form("Billet · " + fmtDay(day.date), BOOKING_FIELDS().filter(f => !["type", "checkout", "dayId", "address", "cancelBy", "hin", "hout"].includes(f.key)), { type: "train", status: "confirmed" }, { submit: "Ajouter" });
    if (!v || !v.name) return;
    mutate(() => api("POST", "bookings", { ...formToBk({ ...v, type: "train" }), city: day.city, checkin: day.date, checkout: day.date, dayId: day.id }), "Billet ajouté");
  },
  // notes
  async addNote() {
    const v = await form("Nouvelle note", [{ key: "text", label: "Note", type: "textarea" }], {}, { submit: "Ajouter", focus: "text" });
    if (v && v.text.trim()) mutate(() => api("POST", "notes", { author: S.me?.name || "Moi", text: v.text.trim() }), "Note ajoutée");
  },
  async editNote(el) {
    const n = S.data.notes.find(x => x.id === el.dataset.id);
    const v = await form("Note", [{ key: "text", label: "Note", type: "textarea" }], n, { onDelete: () => removeWithUndo("notes", n, "Note supprimée") });
    if (v) mutate(() => api("PATCH", "notes/" + n.id, { text: v.text }));
  },
  async addGuide(city) {
    const v = await form("Repères · " + city, [{ key: "title", label: "Titre" }, { key: "text", label: "Contenu", type: "textarea", placeholder: "Depuis la gare, transports, phrases utiles…" }], { title: city + " · repères" }, { submit: "Ajouter" });
    if (v && v.text) mutate(() => api("POST", "guides", { city, title: v.title, text: v.text }), "Repères ajoutés");
  },
  async editGuide(g) {
    const v = await form("Repères · " + g.city, [{ key: "title", label: "Titre" }, { key: "text", label: "Contenu", type: "textarea" }], g, { onDelete: () => removeWithUndo("guides", g, "Repères supprimés") });
    if (v) mutate(() => api("PATCH", "guides/" + g.id, v));
  },
  // dépenses
  async addExpense(el) {
    const def = { currency: localCur() || homeCur(), category: (S.data.budget.categories || ["Autre"])[0], date: el?.dataset?.date || (inTrip() ? todayISO() : S.data.trip.start) };
    const v = await form("Dépense", expenseFields(), def, { submit: "Ajouter", focus: "amount" });
    if (!v || v.amount == null || isNaN(v.amount)) return;
    mutate(() => api("POST", "expenses", { ...v, author: S.me?.name || "Moi" }), `${fmtExp(v)} ajoutés`);
  },
  async editExpense(el) {
    const e = S.data.expenses.find(x => x.id === el.dataset.id);
    const v = await form("Dépense", expenseFields(), e, { onDelete: () => removeWithUndo("expenses", e, "Dépense supprimée") });
    if (v) mutate(() => api("PATCH", "expenses/" + e.id, v));
  },
  async editBudget() {
    const b = S.data.budget || {};
    const v = await form("Budget", [localCur() && { key: "rate", label: `${localCur()} pour 1 ${curSym(homeCur())}`, type: "number" }, { key: "note", label: "Note", type: "textarea" }].filter(Boolean), { rate: rate(), ...b });
    if (v) mutate(() => api("PATCH", "budget", v));
  },
  async editBudgetItem(el) {
    const items = S.data.budget.items.map(i => ({ ...i })); const it = items[+el.dataset.idx];
    const v = await form(it.label, [{ key: "label", label: "Poste" }, { key: "amount", label: `Montant prévu (${curSym(homeCur())})`, type: "number" }], it);
    if (!v) return; items[+el.dataset.idx] = v;
    mutate(() => api("PATCH", "budget", { items }));
  },
  // idées
  async pasteIdea() {
    let text = "";
    try { text = await navigator.clipboard.readText(); } catch (_) {}
    const url = (text.match(/https?:\/\/\S+/) || [""])[0];
    actions.addIdea(null, url ? { url } : {});
  },
  async addIdea(el, prefill) {
    const v = await form("Nouvelle idée", IDEA_FIELDS(), prefill || {}, { submit: "Ajouter", focus: prefill?.url ? "" : "url" });
    if (!v) return;
    if (!/^https?:\/\//.test(v.url.trim())) { toast("Le lien doit commencer par http", true); return; }
    mutate(() => api("POST", "ideas", { ...v, url: v.url.trim(), status: "idea", author: S.me?.name || "Moi" }), "Idée ajoutée");
  },
  ideaMenu(el) {
    const i = S.data.ideas.find(x => x.id === el.dataset.id);
    actionSheet(i.title || "Idée", [
      { label: "Ouvrir le lien", icon: "external", run: () => window.open(i.url, "_blank", "noopener") },
      i.status !== "done" && { label: i.dayId ? "Changer de journée" : "Planifier dans une journée", icon: "calendar", run: () => actions.planIdea(i) },
      i.status === "done" ? { label: "Remettre à faire", icon: "undo", run: () => mutate(() => api("PATCH", "ideas/" + i.id, { status: i.dayId ? "planned" : "idea", by: "" })) } : { label: "Marquer comme fait", icon: "check", run: () => mutate(() => api("PATCH", "ideas/" + i.id, { status: "done", by: S.me?.name || "Moi" }), "Fait !") },
      { label: "Modifier", icon: "pen", run: () => actions.editIdea(i) },
    ]);
  },
  async editIdea(i) {
    const v = await form("Idée", IDEA_FIELDS(), i, { onDelete: () => removeWithUndo("ideas", i, "Idée supprimée") });
    if (!v) return;
    const patch = { ...v };
    if (!v.title) { try { const u = await api("GET", "unfurl?url=" + encodeURIComponent(v.url)); patch.title = u.title || ""; patch.thumb = u.thumb || i.thumb || ""; patch.platform = u.platform; } catch (_) {} }
    mutate(() => api("PATCH", "ideas/" + i.id, patch));
  },
  async planIdea(i) {
    const days = S.data.days;
    const def = i.dayId || (i.city ? days.find(d => cityKey(d.city) === cityKey(i.city))?.id : days[0]?.id);
    const v = await form("Planifier", [{ key: "dayId", label: "Journée", type: "day" }, { key: "booking", label: "Réservation", type: "chips", options: BOOKING_OPTS }], { dayId: def, booking: "maybe" }, { submit: "Planifier" });
    if (!v || !v.dayId) return;
    const day = findDay(v.dayId);
    const acts = (day.activities || []).filter(a => a.ideaId !== i.id).concat([{ id: "a" + Date.now().toString(36), title: (i.title || i.url).slice(0, 80), booking: v.booking, done: false, ideaId: i.id, url: i.url }]);
    mutate(async () => { await api("PATCH", "days/" + day.id, { activities: acts }); return api("PATCH", "ideas/" + i.id, { dayId: day.id, city: i.city || day.city, status: "planned" }); }, "Prévu le " + fmtDay(day.date));
  },
  // décalage horaire : préférences de sommeil, propres à ce téléphone
  async editJetlag() {
    const plans = jlPlans(), m = plans.map(x => x.measured).find(Boolean), manual = v => !m || v.src === "manual";
    const v = await form("Mon sommeil", [
      m && { key: "src", label: `Horaires habituels (montre : ${m.bed} – ${m.wake}, ${m.n} nuits)`, type: "chips", options: [["auto", "Mesurés par la montre"], ["manual", "Saisis"]] },
      { key: "bed", label: "Coucher habituel", type: "time", showIf: manual }, { key: "wake", label: "Lever habituel", type: "time", showIf: manual },
      { key: "chrono", label: "Plutôt", type: "chips", options: [["lark", "Lève-tôt"], ["mid", "Entre les deux"], ["owl", "Couche-tard"]] },
      { key: "pre", label: "Jours de pré-adaptation avant le vol", type: "chips", options: [["0", "0"], ["1", "1"], ["2", "2"], ["3", "3"]] },
      { key: "mel", label: "Mélatonine (0,5 mg)", type: "chips", options: [["yes", "Oui"], ["no", "Non"]] },
      { key: "caf", label: "Café, thé", type: "chips", options: [["yes", "Oui"], ["no", "Non"]] },
    ].filter(Boolean), { src: "auto", ...jlPrefs() });
    if (!v) return;
    localStorage.setItem(JL_KEY, JSON.stringify({ ...v, pre: +v.pre })); render();
  },
  jlLeg(el) { S.jl = el.dataset.key; render(); },
  jlPast() { S.jlPast = !S.jlPast; render(); },
  // réglages
  setTheme(el) { applyTheme(el.dataset.theme); el.parentElement.querySelectorAll("button").forEach(b => b.classList.toggle("active", b === el)); },
  // carte
  mapPlace(el) { S.map = { place: el.dataset.key || "", day: "", sheet: "open" }; render(); },
  mapSheet() { setSheet(S.map.sheet === "peek" ? "open" : "peek"); },
  locate() { locateMe(); },
  mapDay(el) { S.map.day = S.map.day === el.dataset.id ? "" : el.dataset.id; render(); },
  mapFocus(el) { focusPin(el.dataset.pin); },
  async logout() {
    closeModal();
    await new Promise(r => setTimeout(r, 240));
    if (!(await confirmSheet("Se déconnecter ?", "Il faudra saisir à nouveau le jeton sur ce téléphone.", "Se déconnecter"))) return;
    localStorage.removeItem("tripToken"); localStorage.removeItem("tripState"); S.token = ""; S.data = null; if (S.es) S.es.close(); renderLogin();
  },
  async pushOn() {
    try {
      const perm = await Notification.requestPermission(); if (perm !== "granted") { toast("Notifications refusées", true); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(S.me.vapid) });
      await api("POST", "push/subscribe", sub.toJSON()); toast("Notifications activées"); renderSettings();
    } catch (e) { toast("Activation impossible : " + e.message, true); }
  },
  async pushOff() {
    try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (sub) { await api("DELETE", "push/subscribe", { endpoint: sub.endpoint }); await sub.unsubscribe(); } toast("Notifications désactivées"); renderSettings(); }
    catch (e) { toast(e.message, true); }
  },
  async restore(el) {
    const name = el.dataset.name;
    closeModal();
    await new Promise(r => setTimeout(r, 240));
    if (!(await confirmSheet("Restaurer cette sauvegarde ?", "L'état actuel sera lui-même sauvegardé avant.", "Restaurer", false))) return;
    try { await api("POST", "backups/" + name + "/restore"); toast("Sauvegarde restaurée"); refresh(); } catch (e) { toast(e.message, true); }
  }
};

function delegate(e) {
  const g = e.target.closest("[data-go]");
  if (g) { e.preventDefault(); go(g.dataset.go, { push: !g.dataset.replace }); return; }
  const sc = e.target.closest("[data-scroll]");
  if (sc) { e.preventDefault(); const el = document.getElementById(sc.dataset.scroll); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 110, behavior: "smooth" }); return; }
  const fi = e.target.closest("[data-ideafilter]");
  if (fi) { S.ideaFilter = fi.dataset.ideafilter; render(); return; }
  if (e.target.closest("a[href]:not([data-act])")) return;
  const a = e.target.closest("[data-act]");
  if (a && actions[a.dataset.act]) { e.preventDefault(); actions[a.dataset.act](a); }
}
$("#view").addEventListener("click", delegate);
$(".topbar").addEventListener("click", delegate);
$("#tabs").onclick = e => {
  const b = e.target.closest("button"); if (!b) return;
  const r = S.route;
  // un second appui sur l'onglet actif revient à la racine / en haut
  if (b.dataset.view === r.view && !r.page) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  go(b.dataset.view === "notebook" ? "#notebook/" + (r.view === "notebook" ? r.sub : S.lastSub || "ideas") : "#" + b.dataset.view, { push: false });
};

// ---------- démarrage ----------
async function boot() {
  loadToken();
  const su = new URL(location.href);
  const shared = su.searchParams.get("url") || su.searchParams.get("text") || "";
  if (shared) { history.replaceState(null, "", su.pathname + "#notebook/ideas"); S.pendingShare = { url: (shared.match(/https?:\/\/\S+/) || [shared])[0], title: su.searchParams.get("title") || "" }; }
  S.route = parseHash(location.hash);
  history.replaceState(history.state, "", routeHash(S.route));
  if (!S.token) return renderLogin();
  const cached = localStorage.getItem("tripState");
  if (cached) { try { S.data = JSON.parse(cached); } catch (_) {} }
  render();
  await refresh();
  connectSSE();
  if (S.pendingShare && S.data) { go("#notebook/ideas", { push: false }); actions.addIdea(null, S.pendingShare); S.pendingShare = null; }
}
// mise à jour de l'app : vérifiée à chaque retour au premier plan ; quand une nouvelle version prend la main, la page se recharge
if ("serviceWorker" in navigator) {
  const hadSW = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadSW) location.reload(); });
  navigator.serviceWorker.register("sw.js").then(reg => {
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); });
    return navigator.serviceWorker.ready;
  }).then(() => setTimeout(precacheFiles, 1500)).catch(() => {});
}
boot();
})();
