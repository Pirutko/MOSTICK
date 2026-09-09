const CACHE = 'mostik-v5.1.4-cache';
const STATIC = [
  '/',
  '/app.css',
  '/app.js',
  '/icons/icon-512.png',
  '/icons/icon-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/icon-maskable-192.png',
  '/offline.html',
  '/manifest.webmanifest'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(STATIC)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const staticAsset = ['/', '/app.css', '/app.js', '/manifest.webmanifest',
    '/icons/icon-512.png', '/icons/icon-192.png',
    '/icons/icon-maskable-512.png', '/icons/icon-maskable-192.png'].includes(url.pathname);

  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).catch(() => caches.match('/offline.html'))
      )
    );
    return;
  }

  if (staticAsset) {
    event.respondWith((async () => {
      const cached = await caches.match(event.request);
      const network = fetch(event.request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => cached);
      return cached || network;
    })());
    return;
  }

  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
