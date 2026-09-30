import { XMLParser } from 'fast-xml-parser';
import { getDb } from './db';
import { saveCover } from './storage';

const BASE = 'https://api.geekdo.com/xmlapi2';
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'User-Agent': 'what-shall-we-play (personnel)' };
  if (process.env.BGG_TOKEN) h['Authorization'] = `Bearer ${process.env.BGG_TOKEN}`;
  return h;
}

// Garde de débit : max ~1 requête/s vers l'API BGG (ne s'applique pas au téléchargement d'image).
// Le créneau est réservé AVANT la pause : des appelants concurrents sont sérialisés
// (sinon tous lisaient le même lastBggCall et repartaient au même instant).
let lastBggCall = 0;
async function bggGate(): Promise<void> {
  const slot = Math.max(lastBggCall + 1000, Date.now());
  lastBggCall = slot;
  const remaining = slot - Date.now();
  if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
}

async function bggFetch(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    await bggGate();
    const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; } // réseau HS/timeout -> null, l'app reste utilisable
}

export interface ThingParsed {
  bggId: number; title: string; year: number | null; publisher: string | null;
  minPlayers: number | null; maxPlayers: number | null; playtimeMin: number | null;
  weight: number | null; rating: number | null; imageUrl: string | null;
}
export interface ThingResult extends ThingParsed { coverName: string | null; }

const n = (v: unknown): number | null => {
  const x = Number(v); return Number.isFinite(x) ? Math.round(x * 100) / 100 : null;
};

export function parseThingXml(xml: string): ThingParsed | null {
  const root = parser.parse(xml)?.items;
  const item = Array.isArray(root?.item) ? root.item.find((i: Record<string, unknown>) => i['@_type'] === 'boardgame') : root?.item;
  if (!item) return null;
  const val = (path: string): string | undefined =>
    (path.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown> | undefined)?.[k], item) as
      Record<string, unknown> | undefined)?.['@_value'] as string | undefined;
  const name = item.name?.['@_value'] ?? (Array.isArray(item.name) ? item.name.find((x: Record<string, unknown>) => x['@_type'] === 'primary')?.['@_value'] : undefined);
  if (!name) return null;
  return {
    bggId: Number(item['@_id']), title: String(name), year: n(val('yearpublished')),
    publisher: (Array.isArray(item.link) ? item.link : item.link ? [item.link] : [])
      .find((l: Record<string, unknown>) => l['@_type'] === 'boardgamepublisher')?.['@_value'] ?? null,
    minPlayers: n(val('minplayers')), maxPlayers: n(val('maxplayers')), playtimeMin: n(val('playingtime')),
    weight: n(val('statistics.ratings.averageweight')), rating: n(val('statistics.ratings.average')),
    imageUrl: item.image?.['@_src'] ?? null,
  };
}

export async function searchBoardgames(q: string): Promise<{ bggId: number; name: string }[]> {
  const xml = await bggFetch(`${BASE}/search?query=${encodeURIComponent(q)}&type=boardgame`);
  if (!xml) throw new Error('BGG_UNAVAILABLE');
  const root = parser.parse(xml)?.items;
  const items = root?.item ? (Array.isArray(root.item) ? root.item : [root.item]) : [];
  return items.map((i: Record<string, unknown>) => ({ bggId: Number(i['@_id']), name: String((i.name as Record<string, unknown> | undefined)?.['@_value'] ?? '') }));
}

export async function getThing(bggId: number): Promise<ThingResult | null> {
  const db = getDb();
  const cached = db.prepare('SELECT payload_json, fetched_at FROM bgg_cache WHERE bgg_id = ?').get(bggId) as
    { payload_json: string; fetched_at: string } | undefined;
  if (cached && (db.prepare(`SELECT fetched_at >= datetime('now','-30 days') AS fresh FROM bgg_cache WHERE bgg_id = ?`)
        .get(bggId) as { fresh: number } | undefined)?.fresh) {
    return JSON.parse(cached.payload_json) as ThingResult;
  }
  const xml = await bggFetch(`${BASE}/things?id=${bggId}&stats=1`);
  const parsed = xml ? parseThingXml(xml) : null;
  if (!parsed) return cached ? JSON.parse(cached.payload_json) : null;
  // bggId = clé demandée : le payload caché sous bgg_id X doit rapporter bggId X
  const result: ThingResult = { ...parsed, bggId, coverName: null };
  db.prepare(`INSERT INTO bgg_cache (bgg_id, payload_json, fetched_at) VALUES (?, ?, datetime('now'))
              ON CONFLICT(bgg_id) DO UPDATE SET payload_json = excluded.payload_json, fetched_at = excluded.fetched_at`)
    .run(bggId, JSON.stringify(result));
  return result;
}

// Télécharge la pochette en local (saveCover, 'jpg') et la persiste dans le cache.
// Hors de getThing : le cache ne doit pas déclencher un 2e fetch (contrainte test 30 jours).
export async function attachCover(thing: ThingResult): Promise<ThingResult> {
  if (thing.coverName || !thing.imageUrl) return thing;
  try {
    const img = await fetch(thing.imageUrl, { signal: AbortSignal.timeout(8000) });
    // content-type image/ requis : évite de sauvegarder une page d'erreur en .jpg
    if (img.ok && img.headers.get('content-type')?.startsWith('image/')) {
      thing.coverName = saveCover(Buffer.from(await img.arrayBuffer()), 'jpg');
      getDb().prepare('UPDATE bgg_cache SET payload_json = ? WHERE bgg_id = ?')
        .run(JSON.stringify(thing), thing.bggId);
    }
  } catch { /* pochette optionnelle, ne casse jamais la fiche */ }
  return thing;
}
