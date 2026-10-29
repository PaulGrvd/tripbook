// Service worker : HTML réseau d'abord, assets cache d'abord, confirmations gardées hors ligne, notifications push.
const VERSION = "tripbook-v1";
const FILES = "tripbook-files"; // cache des confirmations, conservé entre versions
const SHELL = ["./", "index.html", "app.css?v=1", "app.js?v=1", "vendor/leaflet/leaflet.js?v=1", "vendor/leaflet/leaflet.css?v=1", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png",
  "fonts/dmsans-latin.woff2", "fonts/dmsans-latin-ext.woff2", "fonts/fraunces-latin.woff2", "fonts/fraunces-latin-ext.woff2"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== FILES).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.includes("/api/")) return;
  // confirmations (PDF, photos) : cache d'abord, rafraîchies en arrière-plan
  if (url.pathname.includes("/files/")) {
    e.respondWith(caches.open(FILES).then(c => c.match(e.request).then(hit => {
      const net = fetch(e.request).then(res => { if (res.ok) c.put(e.request, res.clone()); return res; });
      if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
      return net;
    })));
    return;
  }
  const isHTML = e.request.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("index.html") || url.pathname.endsWith("manifest.webmanifest"); // manifest : réseau d'abord, son titre vient du serveur
  if (isHTML) {
    e.respondWith(fetch(e.request).then(res => {
      if (res.ok) caches.open(VERSION).then(c => c.put(e.request, res.clone()));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(hit => hit || caches.match("index.html"))));
    return;
  }
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok) caches.open(VERSION).then(c => c.put(e.request, res.clone()));
    return res;
  })));
});
// l'app envoie la liste des confirmations à garder hors ligne
self.addEventListener("message", e => {
  if (!e.data || e.data.type !== "precache" || !Array.isArray(e.data.urls)) return;
  e.waitUntil(caches.open(FILES).then(async c => {
    const keep = new Set(e.data.urls);
    for (const req of await c.keys()) if (!keep.has(req.url) && !/\/files\/(jour|doc)-/.test(req.url)) await c.delete(req);
    for (const u of e.data.urls) { if (!(await c.match(u))) { try { const res = await fetch(u); if (res.ok) await c.put(u, res); } catch (_) {} } }
  }));
});
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Carnet de voyage", {
    body: d.body || "", tag: d.tag || "tripbook", icon: "icons/icon-192.png", badge: "icons/icon-192.png", data: { url: d.url || "/" }, renotify: true
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const target = new URL(e.notification.data && e.notification.data.url || "/", self.location.origin).href;
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) { if (c.url.startsWith(self.location.origin)) { c.navigate(target); return c.focus(); } }
    return clients.openWindow(target);
  }));
});
