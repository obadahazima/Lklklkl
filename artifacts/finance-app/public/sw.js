const CACHE_NAME = 'billy-bills-v3';
const APP_SHELL = ['/', '/index.html', '/favicon.ico', '/logo-symbol-128.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch('/index.html', { cache: 'reload' });
    if (!response.ok) throw new Error('Could not cache the app shell');
    const html = await response.clone().text();
    // Cache the build's hashed entry JS and CSS before activating. Never cache auth/API data.
    const assets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
      .map((match) => new URL(match[1], self.location.origin))
      .filter((url) => url.origin === self.location.origin && url.pathname.includes('/assets/'))
      .map((url) => url.href);
    await cache.addAll([...APP_SHELL, ...new Set(assets)]);
    await cache.put('/index.html', response);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('billy-bills-') && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.includes('__clerk')) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('/index.html', response.clone());
          return response;
        }
        return (await caches.match('/index.html')) || response;
      } catch {
        return (await caches.match('/index.html')) || new Response('Connect once to install the offline app.', { status: 503 });
      }
    })());
    return;
  }
  // Restrict runtime caching to public build assets. HTML must NEVER stand in for a JS/CSS file.
  if (!url.pathname.startsWith('/assets/') && !APP_SHELL.includes(url.pathname)) return;
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) { const cache = await caches.open(CACHE_NAME); await cache.put(request, response.clone()); }
      return response;
    } catch {
      return new Response('Asset unavailable offline. Reconnect to finish installation.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    }
  })());
});
