import { XMLParser } from 'fast-xml-parser';
import { getDb } from './db';
import { saveCover } from './storage';
import type { JeuBgg } from './import-bgg';

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
  designer: string | null; artist: string | null; bestPlayers: number | null;
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
  // Crédits : tous les noms du type de lien, joints par « , » (BGG liste le(s) auteur(s)/illustrateur(s)).
  const linkNames = (type: string): string | null => {
    const links = Array.isArray(item.link) ? item.link : item.link ? [item.link] : [];
    const names = links.filter((l: Record<string, unknown>) => l['@_type'] === type).map((l: Record<string, unknown>) => l['@_value'] as string).filter(Boolean);
    return names.length ? names.join(', ') : null;
  };
  // Sondage « userplayers » : le nombre de joueurs avec le plus de votes « Best ».
  const polls = Array.isArray(item.poll) ? item.poll : item.poll ? [item.poll] : [];
  const userplayers = polls.find((p: Record<string, unknown>) => p['@_name'] === 'userplayers');
  let bestPlayers: number | null = null;
  if (userplayers) {
    const groups = Array.isArray(userplayers.results) ? userplayers.results : userplayers.results ? [userplayers.results] : [];
    let bestVotes = 0;
    for (const g of groups) {
      const opts = Array.isArray(g.result) ? g.result : g.result ? [g.result] : [];
      const best = opts.find((o: Record<string, unknown>) => o['@_value'] === 'Best');
      const votes = Number(best?.['@_votes'] ?? 0);
      const n = Number(g['@_numplayers']);
      if (best && Number.isFinite(n) && votes > bestVotes) { bestVotes = votes; bestPlayers = n; }
    }
  }
  return {
    bggId: Number(item['@_id']), title: String(name), year: n(val('yearpublished')),
    publisher: (Array.isArray(item.link) ? item.link : item.link ? [item.link] : [])
      .find((l: Record<string, unknown>) => l['@_type'] === 'boardgamepublisher')?.['@_value'] ?? null,
    minPlayers: n(val('minplayers')), maxPlayers: n(val('maxplayers')), playtimeMin: n(val('playingtime')),
    weight: n(val('statistics.ratings.averageweight')), rating: n(val('statistics.ratings.average')),
    imageUrl: item.image?.['@_src'] ?? null,
    designer: linkNames('boardgamedesigner'), artist: linkNames('boardgameartist'), bestPlayers,
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

// ── Import de collection (v3.6.0) ─────────────────────────────────────────────
// La collection XMLAPI2 ne donne ni joueurs ni durée ni poids : le client les
// récupérera jeu par jeu via getThing pendant l'import (cache + garde).
export function parseCollectionXml(xml: string): JeuBgg[] {
  const root = parser.parse(xml)?.items;
  const items = root?.item ? (Array.isArray(root.item) ? root.item : [root.item]) : [];
  const out: JeuBgg[] = [];
  for (const i of items as Record<string, unknown>[]) {
    if (i['@_subtype'] && i['@_subtype'] !== 'boardgame') continue;
    const bggId = Number(i['@_objectid']);
    const titre = (i.name as Record<string, unknown> | undefined)?.['@_value'] as string | undefined;
    if (!Number.isFinite(bggId) || bggId <= 0 || !titre) continue;
    const th = i.thumbnail as Record<string, unknown> | undefined;
    out.push({
      bggId, titre,
      annee: n((i.yearpublished as Record<string, unknown> | undefined)?.['@_value']),
      thumb: (th?.['@_value'] ?? th?.['@_src'] ?? null) as string | null,
    });
  }
  return out;
}

// 202 = BGG prépare la collection (file d'attente) : réessais dans un budget,
// Retry-After plafonné à 5 s. Le budget est injectable pour les tests.
export async function collectionUtilisateur(username: string, budgetMs = 15000):
  Promise<{ ok: true; jeux: JeuBgg[] } | { error: string; status: number }> {
  const pseudo = username.trim();
  if (pseudo.length < 1 || pseudo.length > 60) return { error: 'Pseudo BGG invalide', status: 400 };
  const url = `${BASE}/collection?username=${encodeURIComponent(pseudo)}&own=1`;
  const debut = Date.now();
  for (;;) {
    let res: Response;
    try {
      await bggGate();
      res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(8000) });
    } catch { return { error: 'BGG ne répond pas', status: 502 }; }
    if (res.status === 202) {
      const attente = Math.min(Number(res.headers.get('retry-after')) || 2, 5);
      if (Date.now() - debut + attente * 1000 > budgetMs)
        return { error: 'BGG prépare ta collection — réessaie dans un instant', status: 503 };
      await new Promise((r) => setTimeout(r, attente * 1000));
      continue;
    }
    if (!res.ok) return { error: 'BGG ne répond pas', status: 502 };
    let xml: string;
    try {
      xml = await res.text();
    } catch { return { error: 'BGG ne répond pas', status: 502 }; } // coupure en pleine lecture
    if (parser.parse(xml)?.errors) return { error: 'Collection BGG introuvable ou privée', status: 404 };
    return { ok: true, jeux: parseCollectionXml(xml) };
  }
}
