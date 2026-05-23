// Bump these whenever cached payloads change shape so old clients
// don't get stuck on stale assets/data.
const CACHE_NAME = 'ventu-static-v2';
const DATA_CACHE = 'ventu-data-v2';
const DATA_MAX_AGE_MS = 1000 * 60 * 60 * 6; // 6h — conditions update hourly

const STATIC_ASSETS = [
  '/manifest.json',
  '/favicon.svg',
  '/apple-touch-icon.svg',
  '/og-image.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== DATA_CACHE)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  if (url.pathname.startsWith('/data/')) {
    // Network-first: always try fresh data; fall back to cache only if
    // offline AND cached entry is younger than DATA_MAX_AGE_MS.
    event.respondWith(
      caches.open(DATA_CACHE).then(async (cache) => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cloned = response.clone();
            const headers = new Headers(cloned.headers);
            headers.set('x-ventu-cached-at', String(Date.now()));
            const stamped = new Response(await cloned.blob(), {
              status: cloned.status,
              statusText: cloned.statusText,
              headers,
            });
            cache.put(request, stamped);
          }
          return response;
        } catch {
          const cached = await cache.match(request);
          if (!cached) return Response.error();
          const stamp = Number(cached.headers.get('x-ventu-cached-at') || 0);
          if (stamp && Date.now() - stamp > DATA_MAX_AGE_MS) {
            return Response.error();
          }
          return cached;
        }
      })
    );
    return;
  }

  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.woff2')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(request).then((cached) => {
          const fetched = fetch(request).then((response) => {
            if (response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          });
          return cached || fetched;
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      return cached || fetch(request);
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});