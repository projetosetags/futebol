const CACHE = 'futsal-v4';
const ASSETS = [
  './',
  './index.html',
  './jogador.html',
  './app.js?v=20261016-futsal-v4',
  './firebase-futsal.js?v=20261016-futsal-v4',
  './firebase-config-futsal.js',
  './manifest-admin.webmanifest?v=20261016-futsal-v4',
  './manifest-player.webmanifest?v=20261016-futsal-v4',
  '../styles.css?v=20261016-futsal-v4',
  '../firebase-sdk.bundle.js?v=20261016-local-v1'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('futsal-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.includes('/futsal/')) return;
  event.respondWith(fetch(request).then(response => {
    if (response.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone()));
    return response;
  }).catch(() => caches.match(request).then(response => response || caches.match('./index.html'))));
});