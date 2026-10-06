import { XMLParser } from 'fast-xml-parser';
import { getDb } from './db';
import { saveCover } from './storage';
import { t, type Lang } from './i18n';
import type { JeuBgg } from './import-bgg';

// BASE : boardgamegeek.com (et plus api.geekdo.com). Verrouillage BGG (401 +
// WWW-Authenticate: Bearer) : le cookie de session est posé sur .boardgamegeek.com,
// c'est donc ce domaine qui accepte l'auth par cookie. Même backend derrière.
// Base XMLAPI2 surchargeable pour les E2E (stub local, cf. tests/e2e/bgg-stub.cjs) :
// les routes serveur testées bout-en-bout (récupération de pochettes) y branchent.
const BASE = process.env.BGG_BASE ?? 'https://boardgamegeek.com/xmlapi2';
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'User-Agent': 'what-shall-we-play (personnel)' };
  if (process.env.BGG_TOKEN) {
    h['Authorization'] = `Bearer ${process.env.BGG_TOKEN}`;
  } else if (process.env.BGG_COOKIE) {
    // En attendant l'approbation du token développeur : cookie de session
    // (BGG_COOKIE dans .env — jamais commité, à révoquer après usage).
    h['Cookie'] = process.env.BGG_COOKIE;
  }
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

// Les titres BGG contiennent parfois des entités HTML numériques (&#039; pour ')
// que fast-xml-parser laisse en l'état (épinglé en prod : « The King&#039;s Dilemma »).
function decodeEntites(s: string): string {
  const nomme: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, n: string) => nomme[n]);
}

// Les éléments URL XMLAPI2 (image/thumbnail, name et yearpublished de /collection)
// sont du CONTENU TEXTE (épinglé sur réponses réelles : /collection 2026-10-05,
// /thing 2026-10-06) — pas des attributs. On accepte aussi les formes d'objet
// (#text / @_value / @_src) et les nombres (parseTagValue de fast-xml-parser).
function texteOuAttribut(v: unknown): string | undefined {
  if (typeof v === 'string') return decodeEntites(v);
  if (typeof v === 'number') return String(v);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const t = o['#text'] ?? o['@_value'] ?? o['@_src'];
    if (typeof t === 'number') return String(t);
    return typeof t === 'string' ? decodeEntites(t) : (t as string | undefined);
  }
  return undefined;
}

// Comparaison « contient » insensible à la casse et aux accents (NFD + diacritiques).
function sansAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

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
    imageUrl: texteOuAttribut(item.image) ?? null,
    designer: linkNames('boardgamedesigner'), artist: linkNames('boardgameartist'), bestPlayers,
  };
}

export async function searchBoardgames(q: string): Promise<{ bggId: number; name: string; annee: number | null }[]> {
  const xml = await bggFetch(`${BASE}/search?query=${encodeURIComponent(q)}&type=boardgame`);
  if (!xml) throw new Error('BGG_UNAVAILABLE');
  const root = parser.parse(xml)?.items;
  const items = root?.item ? (Array.isArray(root.item) ? root.item : [root.item]) : [];
  // Forme réelle /search (épinglée 2026-10-05) : année en @value, comme /thing.
  // Aucune image dans les réponses — les pochettes viennent de /thing, côté UI.
  // L'autocomplete promet « contient ce que je tape » : /search BGG est flou
  // (préfixes, mots voisins) → post-filtre insensible casse + accents.
  const q2 = sansAccents(q);
  const parsed: { bggId: number; name: string; annee: number | null }[] = items.map((i: Record<string, unknown>) => ({
    bggId: Number(i['@_id']),
    name: texteOuAttribut(i.name) ?? '',
    annee: n((i.yearpublished as Record<string, unknown> | undefined)?.['@_value']),
  }));
  return parsed.filter((r) => sansAccents(r.name).includes(q2));
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
  // XMLAPI2 /collection réel (épinglé 2026-10-05, cf. fixture) : les valeurs sont
  // du contenu texte ; texteOuAttribut accepte aussi les formes @value/@_src.
  const champ = texteOuAttribut;
  for (const i of items as Record<string, unknown>[]) {
    if (i['@_subtype'] && i['@_subtype'] !== 'boardgame') continue;
    const bggId = Number(i['@_objectid']);
    const titre = champ(i.name);
    if (!Number.isFinite(bggId) || bggId <= 0 || !titre) continue;
    out.push({
      bggId, titre,
      annee: n(champ(i.yearpublished)),
      thumb: champ(i.thumbnail) ?? null,
    });
  }
  return out;
}

// 202 = BGG prépare la collection (file d'attente) : réessais dans un budget,
// Retry-After plafonné à 5 s. Le budget est injectable pour les tests.
// lang : langue du cookie, passée par la route — défaut 'fr' (tests unitaires).
export async function collectionUtilisateur(username: string, budgetMs = 15000, lang: Lang = 'fr'):
  Promise<{ ok: true; jeux: JeuBgg[] } | { error: string; status: number }> {
  const pseudo = username.trim();
  if (pseudo.length < 1 || pseudo.length > 60) return { error: t(lang, 'bgg.errPseudo'), status: 400 };
  const url = `${BASE}/collection?username=${encodeURIComponent(pseudo)}&own=1`;
  const debut = Date.now();
  for (;;) {
    let res: Response;
    try {
      await bggGate();
      res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(8000) });
    } catch { return { error: t(lang, 'bgg.errPasReponse'), status: 502 }; }
    if (res.status === 202) {
      const attente = Math.min(Number(res.headers.get('retry-after')) || 2, 5);
      if (Date.now() - debut + attente * 1000 > budgetMs)
        return { error: t(lang, 'bgg.errPreparation'), status: 503 };
      await new Promise((r) => setTimeout(r, attente * 1000));
      continue;
    }
    if (!res.ok) return { error: t(lang, 'bgg.errPasReponse'), status: 502 };
    let xml: string;
    try {
      xml = await res.text();
    } catch { return { error: t(lang, 'bgg.errPasReponse'), status: 502 }; } // coupure en pleine lecture
    if (parser.parse(xml)?.errors) return { error: t(lang, 'bgg.errCollection'), status: 404 };
    return { ok: true, jeux: parseCollectionXml(xml) };
  }
}
