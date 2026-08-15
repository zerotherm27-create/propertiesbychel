/* Properties by Chel — Owner Dashboard service worker.
 *
 * Scoped to dashboard.html only (see registration in dashboard.html). Caches
 * the app shell for instant repeat loads and offline install on any platform.
 * Cross-origin requests (Supabase, Google Maps/Drive, fonts) are left alone —
 * lead/listing data must always come from the network, never a stale cache.
 */

const CACHE_NAME = 'chel-dashboard-shell-v1';
const SHELL_URLS = [
  '/dashboard.html',
  '/images/logo-navy.png',
  '/images/favicon-32.png',
  '/images/favicon-16.png',
  '/images/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
