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
`;

export function GET() {
  return new Response(SW, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache', // le navigateur revérifie le SW à chaque visite
    },
  });
}
