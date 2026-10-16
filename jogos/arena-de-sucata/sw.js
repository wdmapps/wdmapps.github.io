const CACHE = 'arena-de-sucata-v1.2.1';
const FILES = ['./', './index.html', './style.css', './pwa.css', './game.js', './pwa.js', './manifest.webmanifest', './assets/icon-192.png', './assets/icon-512.png', './assets/icon-maskable.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(names.filter(name => name.startsWith('arena-de-sucata-') && name !== CACHE).map(name => caches.delete(name)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok && response.type === 'basic') { const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy))); }
      return response;
    }).catch(async () => (await caches.match(event.request)) || caches.match('./index.html')));
  } else {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
  }
});
