// Bump this immutable release id whenever the worker or app shell changes.
// A waiting worker must never write into the cache owned by the active worker.
const RELEASE_ID = "2026-07-15-offline-v3";
const SHELL_CACHE = `jeonsangi-shell-${RELEASE_ID}`;
const PACK_CACHE = `jeonsangi-pack-${RELEASE_ID}`;
const APP_SHELL = [
  "/",
  "/offline",
  "/exam",
  "/formulas",
  "/review",
  "/manifest.webmanifest",
  "/favicon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) =>
            (key.startsWith("jeonsangi-shell-") && key !== SHELL_CACHE) ||
            (key.startsWith("jeonsangi-pack-") && key !== PACK_CACHE),
          )
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "CLEAR_OFFLINE_PACK_CACHE") {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("jeonsangi-pack-"))
          .map((key) => caches.delete(key)),
      )),
    );
    return;
  }
  if (event.data?.type !== "CACHE_URLS" || !Array.isArray(event.data.urls)) return;
  const urls = [...new Set(event.data.urls)]
    .map((value) => {
      try {
        const url = new URL(value, self.location.origin);
        return url.origin === self.location.origin ? `${url.pathname}${url.search}` : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      Promise.allSettled(urls.map((url) => cache.add(url))),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy)));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(SHELL_CACHE);
          return (
            (await cache.match(request)) ??
            (await cache.match("/offline")) ??
            (await cache.match("/")) ??
            Response.error()
          );
        }),
    );
    return;
  }

  if (url.pathname === "/api/offline-pack") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && !url.searchParams.has("download")) {
            const copy = response.clone();
            event.waitUntil(caches.open(PACK_CACHE).then((cache) => cache.put(request, copy)));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(PACK_CACHE);
          return (await cache.match(request)) ?? Response.error();
        }),
    );
    return;
  }

  if (["script", "style", "font", "image", "manifest"].includes(request.destination)) {
    event.respondWith(
      caches.open(SHELL_CACHE).then((cache) => cache.match(request)).then((cached) =>
        cached ?? fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy)));
          }
          return response;
        }),
      ),
    );
  }
});
