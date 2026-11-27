const V = "galaxite-mobile-v9";
const FILES = ["./", "index.html","v3.css","v3.js","v4.js","v4.css","panel.css","panel.js","team.html","team.js","siteadmin.html","siteadmin.js", "style.css", "data.js", "app.js", "v2.css", "account.js", "auth-config.js", "payments-config.js", "icon.svg"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(V).then((x) => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request).then((m) => m || caches.match("index.html","v3.css","v3.js"))));
});
