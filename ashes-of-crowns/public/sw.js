// Bump CACHE on every shell change so old caches are purged on activate.
const CACHE = 'ashes-of-crowns-v3';
const scopeUrl = () => new URL('./', self.registration.scope).toString();

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add(scopeUrl()).catch(() => undefined)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (fallbackUrl && (await cache.match(fallbackUrl))) || new Response('Offline and this resource has not been cached yet.', { status: 504, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

// HTML / manifest / sw must always be fresh (a cache-first index.html pinned players to an old build forever);
// only Vite's content-hashed /assets/ files are safe to serve cache-first.
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.includes('/assets/')) {
    event.respondWith(caches.match(request).then(hit => hit || networkFirst(request)));
  } else {
    event.respondWith(networkFirst(request, request.mode === 'navigate' ? scopeUrl() : undefined));
  }
});
