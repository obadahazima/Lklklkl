const CACHE_NAME = 'billy-bills-v2';
const APP_SHELL = [
  '/',
  '/index.html',
  '/favicon.ico',
  '/logo-symbol.png',
  '/logo-symbol-128.png',
  '/logo-symbol-64.png',
  '/logo.png',
  '/logo.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) return caches.delete(k);
          return Promise.resolve();
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Prefer network for API calls
  if (request.url.includes('/api') || request.url.includes('/ai')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // optionally put a clone in cache
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // For page navigations, always prefer the network so users get the latest
  // build instead of a stale cached HTML shell (fall back to cache offline).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, resClone));
          return res;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/index.html')))
    );
    return;
  }

  // For other static assets, try cache first then network
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).catch(() => caches.match('/index.html')))
  );
});