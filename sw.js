const CACHE_NAME = "futebol-shell-v19";
const SHELL = [
  "./",
  "./index.html",
  "./jogador.html",
  "./styles.css",
  "./styles.css?v=20261007-roster-grouped-v11",
  "./app.js?v=20261007-roster-grouped-v11",
  "./firebase.js",
  "./firebase.js?v=20261007-player-game-choice-v6",
  "./firebase-config.js",
  "./manifest-lideranca.webmanifest",
  "./manifest-jogador.webmanifest",
  "./icons/futebol-lideranca-180.png?v=20261007-icon-png-fix2",
  "./icons/futebol-lideranca-192.png?v=20261007-icon-png-fix2",
  "./icons/futebol-lideranca-512.png?v=20261007-icon-png-fix2",
  "./icons/futebol-jogador-180.png?v=20261007-icon-png-fix2",
  "./icons/futebol-jogador-192.png?v=20261007-icon-png-fix2",
  "./icons/futebol-jogador-512.png?v=20261007-icon-png-fix2"
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
