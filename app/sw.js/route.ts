// app/sw.js/route.ts — le service worker, servi à /sw.js (v4.7.4, audit : hygiène).
// Le nom du cache porte la version de package.json, injectée au build (route statique) :
// plus de public/sw.js réécrit par un script à chaque build (l'arbre git restait modifié).
// Changement de version → nouveau cache → l'ancien est purgé à l'activation.
import pkg from '../../package.json';

export const dynamic = 'force-static';

const SW = `const CACHE = 'wsp-v${pkg.version}';
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
// v4.9.0 : notifications push. Le tag remplace une notification du même sujet au lieu de l'empiler.
self.addEventListener('push', (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch (_) { /* message illisible : notification générique */ }
  e.waitUntil(self.registration.showNotification(m.titre || 'What Shall We Play', {
    body: m.corps || '', tag: m.tag, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url: m.url || '/nights' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/nights', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    const w = ws.find((c) => c.url.startsWith(self.location.origin));
    return w ? w.navigate(url).then((c) => (c || w).focus()) : self.clients.openWindow(url);
  }));
});
`;

export function GET() {
  return new Response(SW, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache', // le navigateur revérifie le SW à chaque visite
    },
  });
}
