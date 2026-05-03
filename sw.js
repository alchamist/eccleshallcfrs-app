const CACHE = 'cfr-v1';

const STATIC = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/vehicle-shift.html',
  '/duty-hours.html',
  '/vehicle-inspection.html',
  '/mileage-claim.html',
  '/monthly-check.html',
  '/coordinator.html',
  '/compliance.html',
  '/css/app.css',
  '/js/app.js',
  '/js/dashboard.js',
  '/js/vehicle-shift.js',
  '/js/duty-hours.js',
  '/js/vehicle-inspection.js',
  '/js/mileage-claim.js',
  '/js/monthly-check.js',
  '/js/coordinator.js',
  '/js/compliance.js',
  '/manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // Never intercept API calls — app.js handles offline fallback
  if (url.pathname.startsWith('/api/')) return;

  // Cache-first for static assets
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(res => {
        if (res.ok && request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(request, clone));
        }
        return res;
      });
    })
  );
});

// Background sync — tell the client to flush its IndexedDB queue
self.addEventListener('sync', e => {
  if (e.tag === 'cfr-sync') {
    e.waitUntil(
      self.clients.matchAll().then(clients =>
        clients.forEach(c => c.postMessage({ type: 'SYNC_REQUESTED' }))
      )
    );
  }
});
