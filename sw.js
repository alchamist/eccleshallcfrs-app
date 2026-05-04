// Bump this string on every deploy to evict stale caches from users' devices.
const CACHE = 'cfr-v3';

const STATIC = [
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
  // allSettled so one bad URL never aborts the whole install
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.allSettled(STATIC.map(url => cache.add(url)))
    )
  );
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

  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // HTML and JS: network-first so code changes are always picked up immediately;
  // fall back to cache only when offline.
  if (request.mode === 'navigate' || url.pathname.endsWith('.js')) {
    e.respondWith(
      fetch(request).then(res => {
        if (res.ok && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(request, clone));
        }
        return res;
      }).catch(() =>
        caches.match(request).then(r => r || caches.match('/index.html'))
      )
    );
    return;
  }

  // CSS, images, manifest: cache-first (rarely change)
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(res => {
        if (res.ok && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(request, clone));
        }
        return res;
      });
    })
  );
});

self.addEventListener('sync', e => {
  if (e.tag === 'cfr-sync') {
    e.waitUntil(
      self.clients.matchAll().then(clients =>
        clients.forEach(c => c.postMessage({ type: 'SYNC_REQUESTED' }))
      )
    );
  }
});
