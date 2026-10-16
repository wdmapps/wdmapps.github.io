const CACHE = 'arena-de-sucata-v1.4.0';
const FILES = ['./', './index.html', './style.css', './pwa.css?v=1.4.0', './responsive.css?v=1.4.0', './game.js?v=1.4.0', './pwa.js?v=1.4.0', './manifest.webmanifest?v=1.4.0', './assets/icon-192.png', './assets/icon-512.png', './assets/icon-maskable.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => Promise.all(FILES.map(async file => {
    const response = await fetch(new Request(new URL(file, self.registration.scope), {cache:'reload'}));
    if (!response.ok) throw new Error('Precache failed');
    await cache.put(file, response);
  }))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(names.filter(name => name.startsWith('arena-de-sucata-') && name !== CACHE).map(name => caches.delete(name)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === 'navigate' || ['script','style','manifest'].includes(event.request.destination)) {
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok && response.type === 'basic') { const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy))); }
      return response;
    }).catch(async () => (await caches.match(event.request)) || (event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
  } else {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
  }
});
