const CACHE = 'wsp-v3.5.0'; // remplacé à chaque build par la version de package.json (scripts/sync-sw-version.mjs)
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const cacheable = url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/api/cover/');
  if (!cacheable) return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
    const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res;
  })));
});
