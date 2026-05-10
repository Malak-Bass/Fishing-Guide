// Network-first for HTML so users see new pushes on next reload.
// Cache-first for static assets that don't change (fonts, icons).
// On install: skip waiting. On activate: claim all clients immediately.
const CACHE = 'mcgee-bass-v4';
const ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function networkFirst(req) {
  return fetch(req).then(res => {
    const clone = res.clone();
    caches.open(CACHE).then(c => c.put(req, clone));
    return res;
  }).catch(() => caches.match(req));
}

function cacheFirst(req) {
  return caches.match(req).then(cached => {
    if (cached) return cached;
    return fetch(req).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(req, clone));
      return res;
    });
  });
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Dev bypass: localhost always goes to network so edits show live.
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }

  // Anthropic API — network-first, fail silently offline (legacy).
  if (url.host === 'api.anthropic.com') {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ offline: true }), {
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // Open-Meteo (weather) — network-only with cache fallback. We never want stale weather.
  if (url.host.endsWith('open-meteo.com')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }

  // HTML / page navigations — NETWORK-FIRST so new pushes show on reload.
  if (e.request.mode === 'navigate' || e.request.destination === 'document') {
    e.respondWith(networkFirst(e.request));
    return;
  }

  // Manifest also changes occasionally — network-first.
  if (url.pathname.endsWith('manifest.json')) {
    e.respondWith(networkFirst(e.request));
    return;
  }

  // Everything else (Google Fonts, etc.) — cache-first.
  e.respondWith(cacheFirst(e.request));
});
