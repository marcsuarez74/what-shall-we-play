// Stub XMLAPI2 minimal pour les E2E (v4.5.0) : répond à /things?id=N[,M…] avec une
// fiche dont l'image pointe sur lui-même — la récupération de pochettes
// (route serveur → getThing → attachCover) tourne alors bout-en-bout sans BGG.
// Lancé comme second webServer (playwright.config, BGG_BASE).
const http = require('node:http');

const JPEG_1PX = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==',
  'base64',
);

const PORT = 8765;
// v4.23.0 — l'import Myludo cherche désormais côté serveur : quelques jeux connus du stub
// (recherche /search?query= exacte, fiches nommées). Tout autre id reste « Through the Desert ».
const JEUX = {
  174430: { nom: 'Gloomhaven', annee: 2017, auteur: 'Isaac Childres' },
  266192: { nom: 'Wingspan', annee: 2019 },
  148228: { nom: 'Splendor', annee: 2014 },
  999001: { nom: 'Splendor', annee: 2024 },
};
const RECHERCHE = { Gloomhaven: [174430], Wingspan: [266192], Splendor: [148228, 999001] };
const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const itemXml = (id) => {
  const j = JEUX[id] ?? { nom: 'Through the Desert', annee: 1993 };
  return `  <item type="boardgame" id="${id}">
    <name type="primary" value="${esc(j.nom)}"/>
    <yearpublished value="${j.annee}"/>
    <image>http://localhost:${PORT}/img/${id}.jpg</image>${j.auteur ? `\n    <link type="boardgamedesigner" id="1" value="${esc(j.auteur)}"/>` : ''}
  </item>`;
};
const items = (corps) => `<?xml version="1.0" encoding="utf-8"?>
<items termsofuse="https://boardgamegeek.com/xmlapi/termsofuse">
${corps}
</items>`;

http.createServer((req, res) => {
  if (req.url.startsWith('/img/')) {
    res.writeHead(200, { 'Content-Type': 'image/jpeg' });
    res.end(JPEG_1PX);
    return;
  }
  const url = new URL(req.url, `http://localhost:${PORT}`);
  res.writeHead(200, { 'Content-Type': 'text/xml' });
  if (url.pathname.endsWith('/search')) {
    const ids = RECHERCHE[url.searchParams.get('query') ?? ''] ?? [];
    res.end(items(ids.map((id) => `  <item type="boardgame" id="${id}"><name type="primary" value="${esc(JEUX[id].nom)}"/><yearpublished value="${JEUX[id].annee}"/></item>`).join('\n')));
    return;
  }
  const ids = (url.searchParams.get('id') ?? '0').split(',').filter(Boolean);
  res.end(items(ids.map(itemXml).join('\n')));
}).listen(PORT, () => console.log(`stub BGG sur :${PORT}`));
