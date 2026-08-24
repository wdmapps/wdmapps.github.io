const CACHE = 'wdm-leitor-v2';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './storage.js',
  './comic.js',
  './kindle-fix.js',
  './pwa-install.js',
  './manifest.webmanifest',
  '../assets/logo.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(APP_SHELL.map(url => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('wdm-leitor-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function networkFirst(request, fallback) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request, { cache: 'no-store' });
    if (fresh && fresh.ok) cache.put(request, fresh.clone()).catch(() => {});
    return fresh;
  } catch (e) {
    return (await caches.match(request)) || (fallback ? await caches.match(fallback) : undefined) || Response.error();
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Navegação e arquivos de código: sempre tenta a versão mais nova primeiro.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, './index.html'));
    return;
  }

  if (url.origin !== self.location.origin) return;

  const isCode = /\.(?:js|mjs|css|html|webmanifest)$/i.test(url.pathname);
  if (isCode) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Imagens e outros arquivos estáticos podem usar cache primeiro.
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const fresh = await fetch(request);
    const cache = await caches.open(CACHE);
    if (fresh && fresh.ok) cache.put(request, fresh.clone()).catch(() => {});
    return fresh;
  })());
});
