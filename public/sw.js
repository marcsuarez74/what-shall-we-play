const CACHE = 'wsp-v3.6.0'; // remplacé à chaque build par la version de package.json (scripts/sync-sw-version.mjs)
self.addEventListener('install', (e) => self.skipWaiting());
// v4.7.3 (audit, point 13) : les pochettes ont des noms uuid immuables → cache à part,
// non versionné, qui survit aux releases (seul le code /_next/static/ est re-téléchargé).
const COVERS = 'wsp-covers';
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== COVERS).map((k) => caches.delete(k))))));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const cible = url.pathname.startsWith('/api/cover/') ? COVERS : url.pathname.startsWith('/_next/static/') ? CACHE : null;
  if (!cible) return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(cible).then((c) => c.put(e.request, copy)); }
    return res;
  })));
});
