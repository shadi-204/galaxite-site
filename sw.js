const CACHE_PREFIX = "galaxite-mobile-";
const V = CACHE_PREFIX + "v16";
const FILES = [
  "./",
  "./index.html",
  "./404.html",
  "./style.css",
  "./v2.css",
  "./v3.css",
  "./v4.css",
  "./data.js",
  "./account.js",
  "./reports.js",
  "./catalog.js",
  "./app.js",
  "./v3.js",
  "./v4.js",
  "./auth-config.js",
  "./supabase-client.js",
  "./payments-config.js",
  "./icon.svg",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(V)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== V)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === "basic") {
          return caches.open(V)
            .then((cache) => cache.put(request, response.clone()))
            .then(() => response)
            .catch(() => response);
        }
        return response;
      })
      .catch(async () => {
        const cache = await caches.open(V);
        const cached = await cache.match(request);
        if (cached) return cached;

        if (request.mode === "navigate") {
          const fallbackUrl = new URL("./index.html", self.registration.scope).toString();
          const fallback = await cache.match(fallbackUrl);
          if (fallback) return fallback;
        }

        return new Response("أنت غير متصل بالإنترنت، حاول مرة أخرى عند عودة الاتصال.", {
          status: 503,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store"
          }
        });
      })
  );
});
