const CACHE_NAME = "applebees-gerentes-v1";

const ASSETS = [
  "./",
  "./login-gerente.html",
  "./panel-gerente.html",
  "./gerente.css",
  "./firebase.js",
  "./gerente.js",
  "./install-gerente.js",
  "./manifest-gerente.json",
  "./manzanas.png",
  "./letrag12.png",
  "./letrag1.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => key !== CACHE_NAME ? caches.delete(key) : null))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const req = event.request;

  if (req.method !== "GET") return;

  event.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req))
  );
});