// Bump CACHE_NAME on each release so stale HTML/JS clients refresh.
const CACHE_NAME = 'ventu-static-v9';
const DATA_CACHE = 'ventu-data-v2';
const DATA_MAX_AGE_MS = 1000 * 60 * 60 * 2.5; // 2.5h — align with dataFreshness STALE threshold

const STATIC_ASSETS = [
  '/manifest.json',
  '/favicon.svg',
  '/apple-touch-icon.svg',
  '/og-image.svg',
];

function isHtmlNavigation(request) {
  if (request.mode === 'navigate') return true;
  const accept = request.headers.get('accept') || '';
  return accept.includes('text/html');
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== DATA_CACHE)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  if (url.pathname.startsWith('/data/')) {
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
      }),
    );
    return;
  }

  // HTML: network-first so deploys reach users immediately (was cache-first → stuck on old UI).
  if (isHtmlNavigation(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  // Hashed JS/CSS/fonts: network-first when online; cache only for offline fallback.
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.woff2')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => response)
      .catch(() => caches.match(request)),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
