const CACHE_NAME = "futebol-shell-v1";
const SHELL = [
  "./",
  "./jogador.html",
  "./styles.css",
  "./styles.css?v=20261005-mobile-fit",
  "./app.js?v=20261005-approve",
  "./firebase.js?v=20261005-approve",
  "./firebase-config.js",
  "./manifest.webmanifest",
  "./icons/futebol-180.png",
  "./icons/futebol-192.png",
  "./icons/futebol-512.png"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("futebol-shell-") && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, copy)));
      }
      return response;
    }).catch(() => caches.match(request).then(cached => cached || caches.match("./")))
  );
});
