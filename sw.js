const CACHE_NAME = "futebol-shell-v60";
const SHELL = [
  "./roster-import.js?v=20261016-presence-v2",
  "./",
  "./index.html",
  "./jogador.html",
  "./jogador.html?v=20261016-ios-auth-persistence-v1",
  "./styles.css",
  "./styles.css?v=20261016-boot-recovery-v1",
  "./app.js?v=20261016-ios-auth-persistence-v1",
  "./event-0910-photos.js?v=20261015-scroll-v1",
  "./firebase.js",
  "./firebase.js?v=20261016-ios-auth-persistence-v1",
  "./firebase-config.js",
  "./firebase-sdk.bundle.js?v=20261016-local-v1",
  "./manifest-lideranca.webmanifest?v=20261016-pwa-v1",
  "./manifest-jogador.webmanifest?v=20261016-pwa-v1",
  "./icons/futebol-lideranca-180.png?v=20261007-icon-png-fix2",
  "./icons/futebol-lideranca-192.png?v=20261007-icon-png-fix2",
  "./icons/futebol-lideranca-512.png?v=20261007-icon-png-fix2",
  "./icons/futebol-jogador-180.png?v=20261007-icon-png-fix2",
  "./icons/futebol-jogador-192.png?v=20261007-icon-png-fix2",
  "./icons/futebol-jogador-512.png?v=20261007-icon-png-fix2"
];
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(SHELL.map(async path => {
      const url = new URL(path, self.registration.scope);
      const response = await fetch(new Request(url, { cache: "reload" }));
      if (response.ok) await cache.put(url, response);
    }));
  })());
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
