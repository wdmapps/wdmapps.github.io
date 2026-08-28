const CACHE_NAME = "contash-pwa-v1";
const APP_SHELL = [
  "./contash.html",
  "./contash.css",
  "./contash.js",
  "./contash-core.mjs",
  "./contash-install.js",
  "./contash.webmanifest",
  "./img/contash.png",
  "./img/contash-512.png",
  "./audio/contash/musica_fundo.mp3",
  "./audio/contash/acerto.wav",
  "./audio/contash/erro.mp3",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith("contash-pwa-") && key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    );
    await self.clients.claim();
  })());
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok) cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch {
    return (await caches.match(request))
      || (fallbackUrl ? await caches.match(fallbackUrl) : undefined)
      || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "./contash.html"));
    return;
  }

  if (/\.(?:html|css|js|mjs|webmanifest)$/i.test(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  })());
});
