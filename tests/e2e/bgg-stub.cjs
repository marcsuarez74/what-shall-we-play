// Stub XMLAPI2 minimal pour les E2E (v4.5.0) : répond à /things?id=N avec une
// fiche dont l'image pointe sur lui-même — la récupération de pochettes
// (route serveur → getThing → attachCover) tourne alors bout-en-bout sans BGG.
// Lancé comme second webServer (playwright.config, BGG_BASE).
const http = require('node:http');

const JPEG_1PX = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==',
  'base64',
);

const PORT = 8765;
const thingXml = (id) => `<?xml version="1.0" encoding="utf-8"?>
<items termsofuse="https://boardgamegeek.com/xmlapi/termsofuse">
  <item type="boardgame" id="${id}">
    <name type="primary" value="Through the Desert"/>
    <yearpublished value="1993"/>
    <image>http://localhost:${PORT}/img/${id}.jpg</image>
  </item>
</items>`;

http.createServer((req, res) => {
  if (req.url.startsWith('/img/')) {
    res.writeHead(200, { 'Content-Type': 'image/jpeg' });
    res.end(JPEG_1PX);
    return;
  }
  const id = (req.url.match(/id=(\d+)/) || [])[1] ?? '0';
  res.writeHead(200, { 'Content-Type': 'text/xml' });
  res.end(thingXml(id));
}).listen(PORT, () => console.log(`stub BGG sur :${PORT}`));
