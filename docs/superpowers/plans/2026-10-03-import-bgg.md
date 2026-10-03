# Import de collection BGG — Plan d'implémentation (v3.6.0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un champ « pseudo BGG » préremplit la ludothèque avec la collection possédée sur
BoardGameGeek — preview avec dédoublonnage, format de boîte global ajustable par jeu, import
jeu par jeu (~1 s) avec progression, relançable sans jamais doubler une fiche.

**Architecture:** Une seule nouvelle route de **lecture** `GET /api/bgg/collection` (XMLAPI2
`collection?own=1`, gère le 202 « file d'attente » de BGG). La boucle d'import vit **côté
client** et réutilise l'existant : `/api/bgg/thing` (cache 30 j, garde 1 req/s, pochette
rapatriée) puis `POST /api/games` (validation, foyer, pochette) ou, pour enrichir une fiche
manuelle, un nouveau `PATCH /api/games/[id]/enrichir` qui délègue à `enrichirJeu`
(`lib/games.ts`). Le dédoublonnage (`bgg_id` exact, puis titre normalisé) est une fonction
pure `planifierImport` (`lib/import-bgg.ts`) — l'idempotence de la relance en découle.

**Tech Stack:** Next.js App Router + TypeScript, better-sqlite3, fast-xml-parser (déjà là),
Vitest, Playwright (workers 1).

**Spec:** `docs/superpowers/specs/2026-10-03-import-bgg-design.md` (lire avec ce plan — le
plan argumente depuis la spec). Maquette validée :
`.superpowers/brainstorm/v36-import-bgg/content/maquette-v36-import-bgg.html`.

## Global Constraints

- UI 100 % français ; palette noyer `#2A1F17` / surface `#3A2B1F` / crème `#F3E9DC` /
  cuivre `#C96F3B` / vert `#3E9B6E` / ambre `#C9A23B` / rouge `#C4553B` ; Bricolage Grotesque
  (display) + Space Grotesque (UI).
- **Aucune nouvelle dépendance npm** (fast-xml-parser et `XMLParser` de `lib/bgg.ts` suffisent).
- BGG est en **lecture seule** : aucune route d'écriture vers BGG, jamais.
- **Jamais de destruction implicite** : l'enrichissement ne touche ni `title`, ni `box_format`,
  ni une photo perso (`cover_path = COALESCE(cover_path, ?)`).
- `box_format` est `NOT NULL` : tout `POST /api/games` de l'import porte le format choisi
  (segmenté global, défaut `grand`, ajustable par ligne).
- La boucle d'import est **séquentielle** (garde 1 req/s de `bggGate` partagée) — jamais de
  `Promise.all` sur les appels BGG.
- Pseudos E2E ≤ 20 caractères ; E2E workers 1 ; **ne jamais éditer de fichiers pendant une
  suite Playwright** (Turbopack surveille la racine). Vitest : `fileParallelism: false`.
- TDD strict : rouge observé puis vert. Suites de référence avant push : `npx vitest run`,
  `npx playwright test`, `npx tsc --noEmit`, `npm run build`.
- **PR obligatoire** (jamais de commit direct sur main, jamais de force-push) ; navigation
  interne via `<Link>` de `next/link` ; les `aria-label` sont l'interface des E2E — les poser
  dès T5 exactement comme écrit ici.
- Version cible : **v3.6.0** (MINOR) — `package.json`, `sw.js` synchronisé au build par
  `scripts/sync-sw-version.mjs`.

## Review Focus

1. **202 prolongé de BGG** (premier import d'un pseudo) : la route ne doit jamais attendre
   indéfiniment — budget ~15 s puis message clair « BGG prépare ta collection — réessaie dans
   un instant » (503). → Pin : T2 (unitaire « 202 en boucle → 503 » avec budget injecté).
2. **XML `<errors>` de BGG** (pseudo invalide) : BGG répond 200 avec `<errors>` — jamais
   interprété comme une collection vide. → Pin : T2 (unitaire « errors → 404 »).
3. **Relance idempotente** : après enrichissement, `bgg_id` est posé → au 2e import, la fiche
   enrichie redevient « déjà présent » — zéro écriture nouvelle, CTA désactivé. → Pin :
   T1 (unitaire « enrichi → dup-bgg ») + T6 (E2E relance).
4. **Enrichissement non destructif** : `title`, `box_format` et une photo perso restent
   intacts après `enrichirJeu`. → Pin : T3 (unitaire « photo conservée, title intact »).
5. **Échec en milieu de boucle** : un `thing` en 502 n'arrête pas les suivants ; le récap est
   exact ; « Réessayer » rejoue uniquement les échecs. → Pin : T6 (E2E échec + réessai).

---

### Task 1: Types + dédoublonnage — `lib/import-bgg.ts`

**Files:**
- Create: `lib/import-bgg.ts`
- Test: `tests/unit/import-bgg.test.ts`

**Interfaces:**
- Produces:
  - `interface JeuBgg { bggId: number; titre: string; annee: number | null; thumb: string | null }`
  - `type EtatLigne = 'nouveau' | 'dup-bgg' | 'dup-titre'`
  - `interface LigneImport { jeu: JeuBgg; etat: EtatLigne; doublonDe: number | null }`
  - `planifierImport(jeux: JeuBgg[], ludotheque: Game[]): LigneImport[]`
- Consumed by: T2 (type `JeuBgg`), T5 (le client classe sa collection avec `planifierImport`).
- Consomme : `normalizeText` (existe, `lib/filters.ts:18`) et `Game` (`lib/types.ts`).

- [ ] **Step 1: Test rouge** — créer `tests/unit/import-bgg.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { planifierImport, type JeuBgg } from '@/lib/import-bgg';
import { createGame, validateGameInput, getGame } from '@/lib/games';
import { registerUser } from '@/lib/auth';
import type { Game } from '@/lib/types';

const jeu = (bggId: number, titre: string, annee: number | null = 2020): JeuBgg =>
  ({ bggId, titre, annee, thumb: null });

function ludothequeDe(titres: { titre: string; bggId?: number | null }[]): Game[] {
  const uid = (registerUser(`imp-${Math.random().toString(36).slice(2, 8)}`, '1234') as { id: number }).id;
  return titres.map(({ titre, bggId = null }) => {
    const v = validateGameInput({ title: titre, box_format: 'moyen' });
    if (!v.ok) throw new Error('fixture invalide');
    const id = createGame(uid, { ...v.value, bgg_id: bggId });
    return getGame(id)!;
  });
}

describe('planifierImport', () => {
  it('bgg_id déjà en ludothèque -> dup-bgg (avec l\u2019id du jeu existant)', () => {
    const ludo = ludothequeDe([{ titre: 'Catan', bggId: 13 }]);
    const r = planifierImport([jeu(13, 'Catan')], ludo);
    expect(r).toEqual([{ jeu: jeu(13, 'Catan'), etat: 'dup-bgg', doublonDe: ludo[0]!.id }]);
  });
  it('même titre qu\u2019une fiche SANS bgg_id -> dup-titre, insensible à la casse et aux accents', () => {
    const ludo = ludothequeDe([{ titre: 'harmonies' }]);
    const r = planifierImport([jeu(266192, 'Harmonies')], ludo);
    expect(r[0]).toMatchObject({ etat: 'dup-titre', doublonDe: ludo[0]!.id });
  });
  it('titre identique mais fiche AVEC bgg_id différent -> nouveau (autre édition, pas un doublon)', () => {
    const ludo = ludothequeDe([{ titre: 'Catan', bggId: 13 }]);
    expect(planifierImport([jeu(999, 'Catan')], ludo)[0]!.etat).toBe('nouveau');
  });
  it('rien ne correspond -> nouveau, doublonDe null', () => {
    expect(planifierImport([jeu(174430, 'Gloomhaven')], ludothequeDe([{ titre: 'Dune' }])))
      .toEqual([{ jeu: jeu(174430, 'Gloomhaven'), etat: 'nouveau', doublonDe: null }]);
  });
  it('épingles Review Focus n°3 : après enrichissement (bgg_id posé), la ligne devient dup-bgg', () => {    const ludo = ludothequeDe([{ titre: 'Wingspan', bggId: 266192 }]);
    expect(planifierImport([jeu(266192, 'Wingspan')], ludo)[0]!.etat).toBe('dup-bgg');
  });
});
```

- [ ] **Step 2: Rouge** — `npx vitest run tests/unit/import-bgg.test.ts` → FAIL
      (`Cannot find module '@/lib/import-bgg'`).

- [ ] **Step 3: Implémentation** — créer `lib/import-bgg.ts` (module **neutre** : ni
      better-sqlite3 ni fetch — importable côté client) :

```ts
// lib/import-bgg.ts — classification de l'import BGG (pur, client-safe).
import type { Game } from './types';
import { normalizeText } from './filters';

export interface JeuBgg { bggId: number; titre: string; annee: number | null; thumb: string | null; }
export type EtatLigne = 'nouveau' | 'dup-bgg' | 'dup-titre';
export interface LigneImport { jeu: JeuBgg; etat: EtatLigne; doublonDe: number | null; }

// Prévue en TDD : déjà en ludothèque par bgg_id -> 'dup-bgg' (ignoré) ; même titre
// normalisé qu'une fiche manuelle (sans bgg_id) -> 'dup-titre' (enrichissement) ; sinon 'nouveau'.
export function planifierImport(jeux: JeuBgg[], ludotheque: Game[]): LigneImport[] {
  const parBggId = new Map(ludotheque.filter((g) => g.bgg_id != null).map((g) => [g.bgg_id as number, g.id]));
  const manuels = ludotheque.filter((g) => g.bgg_id == null);
  return jeux.map((jeu) => {
    const deja = parBggId.get(jeu.bggId);
    if (deja != null) return { jeu, etat: 'dup-bgg' as const, doublonDe: deja };
    const manuel = manuels.find((g) => normalizeText(g.title) === normalizeText(jeu.titre));
    return { jeu, etat: (manuel ? 'dup-titre' : 'nouveau') as EtatLigne, doublonDe: manuel?.id ?? null };
  });
}
```

- [ ] **Step 4: Vert** — `npx vitest run tests/unit/import-bgg.test.ts` → 5/5 PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(import-bgg): classification de l'import — bgg_id, titre normalisé, nouveau (T1)"`

---

### Task 2: Lecture de la collection — `lib/bgg.ts` + fixtures

**Files:**
- Modify: `lib/bgg.ts` (append — parser + fetch avec réessai 202)
- Modify: `tests/unit/bgg.fixture.ts` (append — `COLLECTION_XML`, `COLLECTION_ERRORS_XML`)
- Test: `tests/unit/bgg.test.ts` (append)

**Interfaces:**
- Consumes: `JeuBgg` (type, T1), `bggGate()`/`headers()` (existantes, `lib/bgg.ts:8-23`),
  `XMLParser` configuré `ignoreAttributes: false, attributeNamePrefix: '@_'` (existant, ligne 6).
- Produces:
  - `parseCollectionXml(xml: string): JeuBgg[]` — `[]` sur XML vide/items absents ; ignore les
    items sans nom ou sans id, et les `@_subtype` non boardgame ; thumbnail via `@_value`
    **ou** `@_src` (les deux formes existent selon les endpoints BGG).
  - `collectionUtilisateur(username: string, budgetMs = 15000): Promise<{ ok: true; jeux: JeuBgg[] } | { error: string; status: number }>`
    — pseudo requis (1–60 car. après trim) sinon `{ error: 'Pseudo BGG invalide', status: 400 }` ;
    `<errors>` → `{ error: 'Collection BGG introuvable ou privée', status: 404 }` ; 202 →
    réessai dans le budget (`Retry-After` plafonné à 5 s) puis
    `{ error: 'BGG prépare ta collection — réessaie dans un instant', status: 503 }` ;
    autre HTTP non-200 / réseau → `{ error: 'BGG ne répond pas', status: 502 }` ; 200 sans
    erreur → `{ ok: true, jeux }` (vide = collection sans jeu possédé, ce n'est pas une erreur).
- Consumed by: T4 (la route appelle `collectionUtilisateur`), T5 (via la route).

- [ ] **Step 1: Fixtures** — append à `tests/unit/bgg.fixture.ts` :

```ts
// Forme XMLAPI2 /collection : @objectid (attribut), name/yearpublished/thumbnail en @value.
// (thing, lui, met l'image dans @src — le parseur accepte les deux.)
export const COLLECTION_XML = `<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<items total="2" termsofuse="https://boardgamegeek.com/xmlapi/termsofuse">
  <item objectid="174430" collid="9001" subtype="boardgame">
    <name sortindex="1" value="Gloomhaven"/>
    <yearpublished value="2017"/>
    <image value="https://cf.geekdo-images.com/f-gh.jpg"/>
    <thumbnail value="https://cf.geekdo-images.com/t-gh.jpg"/>
    <status own="1" prevowned="0" fortrade="0" want="0" wanttoplay="0" wanttobuy="0" wishlist="0"/>
    <numplays value="7"/>
  </item>
  <item objectid="266192" collid="9002" subtype="boardgame">
    <name sortindex="1" value="Wingspan"/>
    <yearpublished value="2019"/>
    <thumbnail src="https://cf.geekdo-images.com/t-ws.jpg"/>
    <status own="1" prevowned="0" fortrade="0" want="0" wanttoplay="0" wanttobuy="0" wishlist="0"/>
    <numplays value="0"/>
  </item>
</items>`;

export const COLLECTION_ERRORS_XML = `<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<errors>
  <error>
    <message>Invalid username specified</message>
  </error>
</errors>`;
```

- [ ] **Step 2: Test rouge** — append à `tests/unit/bgg.test.ts` (import `collectionUtilisateur,
      parseCollectionXml` et fixtures `COLLECTION_XML, COLLECTION_ERRORS_XML` ajoutés en tête) :

```ts
describe('collection BGG (import)', () => {
  it('parse les items possédés (name, année, thumbnail @value ou @src)', () => {
    expect(parseCollectionXml(COLLECTION_XML)).toEqual([
      { bggId: 174430, titre: 'Gloomhaven', annee: 2017, thumb: 'https://cf.geekdo-images.com/t-gh.jpg' },
      { bggId: 266192, titre: 'Wingspan', annee: 2019, thumb: 'https://cf.geekdo-images.com/t-ws.jpg' },
    ]);
  });
  it('XML vide ou sans items -> []', () => {
    expect(parseCollectionXml('<items total="0"></items>')).toEqual([]);
    expect(parseCollectionXml('')).toEqual([]);
  });
  it('épingles Review Focus n°2 : <errors> BGG -> 404 (pas une collection vide)', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(COLLECTION_ERRORS_XML, { status: 200 }));
    expect(await collectionUtilisateur('introuvable')).toEqual({
      error: 'Collection BGG introuvable ou privée', status: 404 });
  });
  it('pseudo vide ou trop long -> 400, sans appel réseau', async () => {
    global.fetch = vi.fn();
    expect(await collectionUtilisateur('  ')).toEqual({ error: 'Pseudo BGG invalide', status: 400 });
    expect(await collectionUtilisateur('x'.repeat(61))).toEqual({ error: 'Pseudo BGG invalide', status: 400 });
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it('202 puis 200 -> réessai et succès (Retry-After respecté, plafonné à 5 s)', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 202, headers: { 'Retry-After': '1' } }))
      .mockResolvedValueOnce(new Response(COLLECTION_XML, { status: 200 }));
    const r = await collectionUtilisateur('quelquun');
    expect(r).toMatchObject({ ok: true });
    expect((r as { jeux: unknown[] }).jeux).toHaveLength(2);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
  it('épingles Review Focus n°1 : 202 en boucle -> 503 dès le budget dépassé', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('', { status: 202, headers: { 'Retry-After': '1' } }));
    const r = await collectionUtilisateur('quelquun', 1500);
    expect(r).toEqual({ error: 'BGG prépare ta collection — réessaie dans un instant', status: 503 });
  });
  it('HTTP 404/500 ou réseau -> 502', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('', { status: 500 }));
    expect(await collectionUtilisateur('quelquun')).toEqual({ error: 'BGG ne répond pas', status: 502 });
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    expect(await collectionUtilisateur('quelquun')).toEqual({ error: 'BGG ne répond pas', status: 502 });
  });
});
```

- [ ] **Step 3: Rouge** — `npx vitest run tests/unit/bgg.test.ts` → les nouveaux tests FAIL
      (`parseCollectionXml is not a function`), les anciens restent verts.

- [ ] **Step 4: Implémentation** — d'abord ajouter **en tête de `lib/bgg.ts`** (avec les
      autres imports, avant tout code) :

```ts
import type { JeuBgg } from './import-bgg';
```

Puis append à `lib/bgg.ts` :

```ts
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
    const xml = await res.text();
    if (parser.parse(xml)?.errors) return { error: 'Collection BGG introuvable ou privée', status: 404 };
    return { ok: true, jeux: parseCollectionXml(xml) };
  }
}
```

- [ ] **Step 5: Vert** — `npx vitest run tests/unit/bgg.test.ts tests/unit/import-bgg.test.ts`
      → tout PASS (les tests 202 dormaient ~1-2 s : normal).

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(import-bgg): lecture collection XMLAPI2 — parse, 202 avec budget, errors -> 404 (T2)"`

---

### Task 3: Enrichissement — `enrichirJeu` + route `PATCH /api/games/[id]/enrichir`

**Files:**
- Modify: `lib/games.ts` (append — `BggEnrich` + `enrichirJeu` ; import `isSafeCoverName` de `./storage` en tête)
- Create: `app/api/games/[id]/enrichir/route.ts`
- Test: `tests/unit/games.test.ts` (append)

**Interfaces:**
- Consumes: `getGame`, `canManageGame` (existantes, `lib/games.ts:62-74`), `isSafeCoverName`
  (existante, `lib/storage.ts:10`).
- Produces:
  - `interface BggEnrich { bgg_id: number | null; year: number | null; publisher: string | null; min_players: number | null; max_players: number | null; playtime_min: number | null; weight: number | null; bgg_rating: number | null; designer: string | null; artist: string | null; best_players: number | null; cover_name: string | null }`
  - `enrichirJeu(userId: number, id: number, e: BggEnrich): { ok: true } | { error: string; status: number }`
    — 404 « Jeu introuvable » si absent ou non gérable ; `UPDATE` des **seuls** champs BGG +
    `bgg_id` ; `title`, `box_format` **jamais écrits** ; pochette
    `cover_path = COALESCE(cover_path, ?)` (une photo perso gagne toujours).
- Consumed by: T5 (le client appelle la route pour chaque ligne « ↻ Enrichir »).

- [ ] **Step 1: Test rouge** — append à `tests/unit/games.test.ts` :

```ts
describe('enrichirJeu (import BGG)', () => {
  it('complète les champs BGG et pose bgg_id, sans toucher title ni box_format', () => {
    const uid = (registerUser('eg1', '1234') as { id: number }).id;
    const gid = createGame(uid, { title: 'Ma version', box_format: 'petit', year: 2000 });
    const res = enrichirJeu(uid, gid, { bgg_id: 266192, year: 2019, publisher: 'Stonemaier Games',
      min_players: 2, max_players: 5, playtime_min: 70, weight: 2.44, bgg_rating: 8.1,
      designer: 'Elizabeth Hargrave', artist: 'Ana Manso', best_players: 3, cover_name: 'import-ws.jpg' });
    expect(res).toEqual({ ok: true });
    const g = getGame(gid)!;
    expect(g).toMatchObject({ bgg_id: 266192, year: 2019, min_players: 2, weight: 2.44, cover_path: 'import-ws.jpg' });
    expect(g.title).toBe('Ma version');           // Review Focus n°4 : titre intact
    expect(g.box_format).toBe('petit');           // Review Focus n°4 : format intact
  });
  it('une photo perso gagne toujours : COALESCE préserve cover_path existant', () => {
    const uid = (registerUser('eg2', '1234') as { id: number }).id;
    const gid = createGame(uid, { title: 'Dune', box_format: 'grand' }, 'photo-perso.jpg');
    enrichirJeu(uid, gid, { bgg_id: 18, year: null, publisher: null, min_players: null, max_players: null,
      playtime_min: null, weight: null, bgg_rating: null, designer: null, artist: null,
      best_players: null, cover_name: 'import-dune.jpg' });
    expect(getGame(gid)!.cover_path).toBe('photo-perso.jpg');
  });
  it('cover_name non sûr -> ignoré (pas de crash, pas de pochette)', () => {
    const uid = (registerUser('eg3', '1234') as { id: number }).id;
    const gid = createGame(uid, { title: 'Deus', box_format: 'grand' });
    enrichirJeu(uid, gid, { bgg_id: 156788, year: null, publisher: null, min_players: null, max_players: null,
      playtime_min: null, weight: null, bgg_rating: null, designer: null, artist: null,
      best_players: null, cover_name: '../../etc/passwd.jpg' });
    expect(getGame(gid)!.cover_path).toBeNull();
  });
  it('404 si le jeu est à un autre joueur (pas de gérance)', () => {
    const marc = (registerUser('eg4', '1234') as { id: number }).id;
    const lea = (registerUser('eg5', '1234') as { id: number }).id;
    const gid = createGame(marc, { title: 'Azul', box_format: 'moyen' });
    expect(enrichirJeu(lea, gid, { bgg_id: 1, year: null, publisher: null, min_players: null,
      max_players: null, playtime_min: null, weight: null, bgg_rating: null, designer: null,
      artist: null, best_players: null, cover_name: null })).toEqual({ error: 'Jeu introuvable', status: 404 });
  });
});
```

Compléter l'import en tête du fichier : `import { validateGameInput, createGame, deleteGame,
listUserLibrary, getGame, enrichirJeu } from '@/lib/games';` (`getGame` et `enrichirJeu` sont
les ajouts).

- [ ] **Step 2: Rouge** — `npx vitest run tests/unit/games.test.ts` → FAIL
      (`enrichirJeu is not a function`).

- [ ] **Step 3: Implémentation lib** — append à `lib/games.ts` (et ajouter
      `import { isSafeCoverName } from './storage';` avec les imports en tête) :

```ts
// ── Import BGG (v3.6.0) : enrichissement d'une fiche saisie à la main ────────
// N'écrit JAMAIS title/box_format (fidèle à la saisie du joueur) et ne remplace
// jamais une photo perso (COALESCE).
export interface BggEnrich {
  bgg_id: number | null; year: number | null; publisher: string | null;
  min_players: number | null; max_players: number | null; playtime_min: number | null;
  weight: number | null; bgg_rating: number | null; designer: string | null; artist: string | null;
  best_players: number | null; cover_name: string | null;
}
export function enrichirJeu(userId: number, id: number, e: BggEnrich): { ok: true } | { error: string; status: number } {
  const g = getGame(id);
  if (!g || !canManageGame(userId, g)) return { error: 'Jeu introuvable', status: 404 };
  const cover = e.cover_name && isSafeCoverName(e.cover_name) ? e.cover_name : null;
  getDb().prepare(`UPDATE games SET bgg_id=?, year=?, publisher=?, min_players=?, max_players=?,
                   playtime_min=?, weight=?, bgg_rating=?, designer=?, artist=?, best_players=?,
                   cover_path=COALESCE(cover_path, ?) WHERE id=?`)
    .run(e.bgg_id, e.year, e.publisher, e.min_players, e.max_players, e.playtime_min, e.weight,
         e.bgg_rating, e.designer, e.artist, e.best_players, cover, id);
  return { ok: true };
}
```

- [ ] **Step 4: Vert (lib)** — `npx vitest run tests/unit/games.test.ts` → 4/4 nouveaux PASS.

- [ ] **Step 5: Route fine** — créer `app/api/games/[id]/enrichir/route.ts` :

```ts
// app/api/games/[id]/enrichir/route.ts — import BGG : complète une fiche manuelle.
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { enrichirJeu } from '@/lib/games';

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v :
  typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.slice(0, 120) : null);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const res = enrichirJeu(user.id, Number((await params).id), {
    bgg_id: num(b.bgg_id), year: num(b.year), publisher: str(b.publisher),
    min_players: num(b.min_players), max_players: num(b.max_players), playtime_min: num(b.playtime_min),
    weight: num(b.weight), bgg_rating: num(b.bgg_rating), designer: str(b.designer),
    artist: str(b.artist), best_players: num(b.best_players),
    cover_name: typeof b.cover_name === 'string' ? b.cover_name : null,
  });
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Vert complet + commit** — `npx vitest run` (tout PASS), `npx tsc --noEmit`.
      `git add -A && git commit -m "feat(import-bgg): enrichissement de fiche manuelle — enrichirJeu + route enrichir (T3)"`

---

### Task 4: Route de lecture `GET /api/bgg/collection`

**Files:**
- Create: `app/api/bgg/collection/route.ts`

**Interfaces:**
- Consumes: `collectionUtilisateur` (T2 — contrat exact : `{ ok, jeux } | { error, status }`).
- Produces: `GET /api/bgg/collection?username=X` → `200 { jeux: JeuBgg[] }` |
  `400/404/502/503 { error }` (statuts et messages exacts de T2) ; `401 { error: 'Non connecté' }`.
- Consumed by: T5 (le client l'appelle au « Récupérer ma collection ») ; les E2E T6 la
  **mockent** au niveau Playwright (le contrat JSON `{ jeux }` fait foi).

- [ ] **Step 1: Route** — créer `app/api/bgg/collection/route.ts` :

```ts
// app/api/bgg/collection/route.ts — lecture seule de la collection possédée (own=1).
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { collectionUtilisateur } from '@/lib/bgg';

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const username = new URL(req.url).searchParams.get('username') ?? '';
  const r = await collectionUtilisateur(username);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ jeux: r.jeux });
}
```

- [ ] **Step 2: Vérifs** — `npx tsc --noEmit` + `npx vitest run` → vert (la logique est
      couverte en T2 ; la route est une traduction de contrat, elle sera traversée par les
      E2E T6 via le serveur réel).

- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat(import-bgg): route GET /api/bgg/collection (T4)"`

---

### Task 5: UI — page `/games/import`, `ImportBggClient`, lien dans « Ajouter »

**Files:**
- Create: `app/games/import/page.tsx`
- Create: `components/ImportBggClient.tsx`
- Modify: `components/AddGameForm.tsx` (lien d'entrée sous `.btn-note`)
- Modify: `app/globals.css` (append — bloc `.imp-*`)

**Interfaces:**
- Consumes: `planifierImport`/`LigneImport` (T1), `GET /api/bgg/collection` (T4, JSON `{ jeux }`),
  `GET /api/bgg/thing` (existant — `Thing` + `coverName`), `POST /api/games` (existant, FormData),
  `PATCH /api/games/[id]/enrichir` (T3), `FORMATS`/`FORMAT_SCALE` (`lib/formats.ts`, existants),
  `UserLite` (`lib/types.ts`), `<Link>` (TabBar déjà couvre la page — pas d'exclusion).
- Produces: les **hooks E2E** (T6 les consomme exactement) :
  - `input` étiqueté `Pseudo BGG` ; bouton `Récupérer ma collection` ;
  - pastille format par ligne : `aria-label="Format de {titre} : {format}"` (clic = cycle
    mini→petit→moyen→grand) ; segmenté global `aria-label="Format par défaut des boîtes importées"`,
    boutons `Grand`/`Moyen`… (`exact: true` requis en E2E, comme `ajout.spec.ts`) ;
  - ligne incluse : bouton puce `aria-label="Importer {titre}"` (`aria-pressed`) ;
  - doublon probable : boutons `aria-label="Enrichir la fiche {titre}"` (défaut, `aria-pressed=true`)
    et `aria-label="Ajouter {titre} comme nouveau jeu"` ;
  - badge texte : `Déjà dans ta ludothèque` / `Doublon probable` / `+ Nouveau` ;
  - CTA : `Importer N jeux` (désactivé : `Rien à importer`) ; `Réessayer le jeu en échec` ;
  - récap : blocs `Jeux importés`, `Fiches enrichies`, `Déjà présents`, `Échecs`.

- [ ] **Step 1: Page** — créer `app/games/import/page.tsx` :

```tsx
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import ImportBggClient from '@/components/ImportBggClient';

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return <main className="page"><ImportBggClient me={user} /></main>;
}
```

- [ ] **Step 2: Client** — créer `components/ImportBggClient.tsx` (le flux de la maquette ;
      boucle **séquentielle**, un échec ne casse pas les suivants) :

```tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { FORMATS, FORMAT_SCALE, FORMAT_LABEL } from '@/lib/formats';
import { planifierImport, type LigneImport } from '@/lib/import-bgg';
import type { BoxFormat, UserLite } from '@/lib/types';
import UserMenu from './UserMenu';

type Thing = {
  bggId: number; title: string; year: number | null; publisher: string | null;
  minPlayers: number | null; maxPlayers: number | null; playtimeMin: number | null;
  weight: number | null; rating: number | null; designer: string | null;
  artist: string | null; bestPlayers: number | null; coverName: string | null;
};
type Stage = 'pseudo' | 'preview' | 'import' | 'recap';
type Fait = { bggId: number; titre: string; resultat: 'importe' | 'enrichi' | 'echec' };
const CYCLE: Record<BoxFormat, BoxFormat> = { mini: 'petit', petit: 'moyen', moyen: 'grand', grand: 'mini' };

export default function ImportBggClient({ me }: { me: UserLite }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('pseudo');
  const [pseudo, setPseudo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lignes, setLignes] = useState<LigneImport[]>([]);
  const [global, setGlobal] = useState<BoxFormat>('grand');
  const [formats, setFormats] = useState<Record<number, BoxFormat>>({});
  const [modes, setModes] = useState<Record<number, 'enrichir' | 'nouveau'>>({});
  const [inclus, setInclus] = useState<Record<number, boolean>>({});
  const [faits, setFaits] = useState<Fait[]>([]);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [totalCible, setTotalCible] = useState(0);

  async function fetchCollection() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/bgg/collection?username=${encodeURIComponent(pseudo.trim())}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'BGG ne répond pas'); return; }
      const jeux = (data.jeux ?? []) as LigneImport['jeu'][];
      if (jeux.length === 0) { setError('Aucun jeu possédé sur BGG — vérifie que ta collection est publique.'); return; }
      const res2 = await fetch('/api/games');
      const ludo = ((await res2.json()).games ?? []) as Parameters<typeof planifierImport>[1];
      const l = planifierImport(jeux, ludo);
      setLignes(l);
      const f: Record<number, BoxFormat> = {}, m: Record<number, 'enrichir' | 'nouveau'> = {}, i: Record<number, boolean> = {};
      for (const li of l) { f[li.jeu.bggId] = global; i[li.jeu.bggId] = true; if (li.etat === 'dup-titre') m[li.jeu.bggId] = 'enrichir'; }
      setFormats(f); setModes(m); setInclus(i);
      setStage('preview');
    } catch { setError('BGG ne répond pas'); } finally { setBusy(false); }
  }

  function majGlobal(f: BoxFormat) {
    setGlobal(f);
    setFormats((prev) => { const n = { ...prev }; for (const l of lignes) if (l.etat !== 'dup-bgg' && modes[l.jeu.bggId] !== 'enrichir') n[l.jeu.bggId] = f; return n; });
  }

  const selection = lignes.filter((l) => l.etat !== 'dup-bgg' && inclus[l.jeu.bggId]);

  async function importer(subset?: LigneImport[]) {
    const cible = subset ?? selection;
    setStage('import'); setFaits([]); setError(null); setBusy(true); setTotalCible(cible.length);
    const resultats: Fait[] = [];
    for (const l of cible) {
      setEnCours(l.jeu.titre);
      const mode = l.etat === 'dup-titre' ? (modes[l.jeu.bggId] ?? 'enrichir') : 'nouveau';
      try {
        const res = await fetch(`/api/bgg/thing?id=${l.jeu.bggId}`);
        if (!res.ok) throw new Error('thing');
        const t = (await res.json()) as Thing;
        if (mode === 'enrichir' && l.doublonDe != null) {
          const r = await fetch(`/api/games/${l.doublonDe}/enrichir`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bgg_id: t.bggId, year: t.year, publisher: t.publisher,
              min_players: t.minPlayers, max_players: t.maxPlayers, playtime_min: t.playtimeMin,
              weight: t.weight, bgg_rating: t.rating, designer: t.designer, artist: t.artist,
              best_players: t.bestPlayers, cover_name: t.coverName }) });
          if (!r.ok) throw new Error('enrichir');
          resultats.push({ bggId: l.jeu.bggId, titre: l.jeu.titre, resultat: 'enrichi' });
        } else {
          const fd = new FormData();
          fd.append('title', t.title || l.jeu.titre);
          fd.append('box_format', formats[l.jeu.bggId] ?? global);
          fd.append('bgg_id', String(t.bggId));
          const vals: Record<string, unknown> = { year: t.year, publisher: t.publisher,
            min_players: t.minPlayers, max_players: t.maxPlayers, playtime_min: t.playtimeMin,
            weight: t.weight, bgg_rating: t.rating, designer: t.designer, artist: t.artist,
            best_players: t.bestPlayers };
          for (const [k, v] of Object.entries(vals)) if (v !== null && v !== '') fd.append(k, String(v));
          if (t.coverName) fd.append('cover_name', t.coverName);
          const r = await fetch('/api/games', { method: 'POST', body: fd });
          if (!r.ok) throw new Error('post');
          resultats.push({ bggId: l.jeu.bggId, titre: l.jeu.titre, resultat: 'importe' });
        }
      } catch { resultats.push({ bggId: l.jeu.bggId, titre: l.jeu.titre, resultat: 'echec' }); }
      setFaits([...resultats]);
    }
    setEnCours(null); setBusy(false);
    setStage('recap');
    router.refresh();
  }

  const nImp = faits.filter((f) => f.resultat === 'importe').length;
  const nEnr = faits.filter((f) => f.resultat === 'enrichi').length;
  const nKo = faits.filter((f) => f.resultat === 'echec').length;
  const nDeja = lignes.filter((l) => l.etat === 'dup-bgg').length;

  return (
    <div>
      <div className="page-head">
        <h1>Importer une collection</h1>
        <UserMenu me={me} />
      </div>
      {error && <p className="hint" role="alert">{error}</p>}

      {stage === 'pseudo' && (
        <div className="imp-bloc">
          <p className="imp-sous">Entre ton pseudo BoardGameGeek : les jeux que tu possèdes
          arrivent dans ta ludothèque — titre, année, pochette, joueurs, durée, poids.</p>
          <label htmlFor="imp-pseudo">Pseudo BGG</label>
          <input id="imp-pseudo" value={pseudo} autoComplete="off"
                 onChange={(e) => setPseudo(e.target.value)} placeholder="ex. marcsua74" />
          <p className="help">Ta collection doit être publique sur BGG. Lecture seule :
          rien n&apos;est modifié sur BGG. Import relançable — les jeux déjà présents sont ignorés.</p>
          <button type="button" className="btn-go" disabled={busy || pseudo.trim().length < 1}
                  onClick={fetchCollection}>
            {busy ? 'BGG prépare ta collection…' : 'Récupérer ma collection'}
          </button>
          <Link className="cancel" href="/games/add">‹ Annuler</Link>
        </div>
      )}

      {stage === 'preview' && (
        <div>
          <p className="imp-sous">{lignes.length} jeu{lignes.length > 1 ? 'x' : ''} trouvé{lignes.length > 1 ? 's' : ''} sur BGG — les doublons sont déjà repérés.</p>
          <p className="field-label">Format des boîtes importées · {FORMAT_LABEL[global]} par défaut</p>
          <div className="seg" role="group" aria-label="Format par défaut des boîtes importées">
            {FORMATS.map((f) => (
              <button key={f} type="button" className={global === f ? 'on' : ''} aria-pressed={global === f}
                      onClick={() => majGlobal(f)}>
                <span className="box" style={{ width: 9 + 4 * FORMAT_SCALE[f], height: 9 + 4 * FORMAT_SCALE[f] }} />
                <span className="lbl">{FORMAT_LABEL[f]}</span>
              </button>
            ))}
          </div>
          <ul className="imp-liste">
            {lignes.map((l) => {
              const exclu = !inclus[l.jeu.bggId];
              const mode = modes[l.jeu.bggId] ?? (l.etat === 'dup-titre' ? 'enrichir' : 'nouveau');
              return (
                <li key={l.jeu.bggId} className={`imp-jeu${exclu ? ' exclu' : ''}${l.etat === 'dup-bgg' ? ' fige' : ''}`}>
                  {l.etat !== 'dup-bgg' && (
                    <button type="button" className="puce" aria-pressed={!exclu}
                            aria-label={`Importer ${l.jeu.titre}`}
                            onClick={() => setInclus((p) => ({ ...p, [l.jeu.bggId]: !p[l.jeu.bggId] }))}>✓</button>
                  )}
                  {l.jeu.thumb
                    ? <img className="cover" src={l.jeu.thumb} alt="" />
                    : <span className="cover is-ph" aria-hidden>♟</span>}
                  <span className="mid">
                    <b className="titre">{l.jeu.titre}</b>
                    <span className="meta">{l.jeu.annee ?? '—'}</span>
                    {l.etat === 'dup-bgg' && <span className="badge ok">= Déjà dans ta ludothèque</span>}
                    {l.etat === 'dup-titre' && (
                      <>
                        <span className="badge dup">↻ Doublon probable</span>
                        <span className="choix-dup">
                          <button type="button" className={mode === 'enrichir' ? 'on' : ''} aria-pressed={mode === 'enrichir'}
                                  aria-label={`Enrichir la fiche ${l.jeu.titre}`}
                                  onClick={() => setModes((p) => ({ ...p, [l.jeu.bggId]: 'enrichir' }))}>↻ Enrichir</button>
                          <button type="button" className={mode === 'nouveau' ? 'on nouveau' : ''} aria-pressed={mode === 'nouveau'}
                                  aria-label={`Ajouter ${l.jeu.titre} comme nouveau jeu`}
                                  onClick={() => setModes((p) => ({ ...p, [l.jeu.bggId]: 'nouveau' }))}>＋ Nouveau</button>
                        </span>
                      </>
                    )}
                    {l.etat === 'nouveau' && <span className="badge new">+ Nouveau</span>}
                  </span>
                  {l.etat !== 'dup-bgg' && mode !== 'enrichir' && (
                    <button type="button" className="fmt"
                            aria-label={`Format de ${l.jeu.titre} : ${formats[l.jeu.bggId] ?? global}`}
                            onClick={() => setFormats((p) => ({ ...p, [l.jeu.bggId]: CYCLE[p[l.jeu.bggId] ?? global] }))}>
                      📦 {FORMAT_LABEL[formats[l.jeu.bggId] ?? global]}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="imp-bas">
            <button type="button" className="btn-go" disabled={selection.length === 0 || busy}
                    onClick={() => importer()}>
              {selection.length === 0 ? 'Rien à importer' : `Importer ${selection.length} jeu${selection.length > 1 ? 'x' : ''}`}
            </button>
            <Link className="cancel" href="/games/add">‹ Autre pseudo</Link>
          </div>
        </div>
      )}

      {stage === 'import' && (
        <div>
          <p className="imp-encours">{enCours ? `${enCours}…` : 'Préparation…'}</p>
          <div className="imp-barre"><div className="fill" style={{ width: `${faits.length * 100 / Math.max(totalCible, 1)}%` }} /></div>
          <p className="imp-num">{faits.length} / {totalCible} · ~1 s par jeu</p>
          <ul className="imp-journal">
            {faits.map((f) => (
              <li key={f.bggId} className={f.resultat}>
                <span className="ico">{f.resultat === 'importe' ? '✓' : f.resultat === 'enrichi' ? '↻' : '✕'}</span>
                {f.titre}
                <span className="pourquoi">{f.resultat === 'importe' ? 'importé' : f.resultat === 'enrichi' ? 'fiche enrichie' : 'BGG n\u2019a pas répondu'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {stage === 'recap' && (
        <div>
          <div className="imp-recap">
            <p className="grand">{nKo > 0 ? '🫤' : '🎉'}</p>
            <h2>{nKo > 0 ? 'Presque tout est importé' : 'Collection importée ✓'}</h2>
          </div>
          <ul className="imp-stats">
            <li className="ok"><span>📥 Jeux importés</span><b>{nImp}</b></li>
            <li className="enr"><span>↻ Fiches enrichies</span><b>{nEnr}</b></li>
            <li className="dup"><span>= Déjà présents</span><b>{nDeja}</b></li>
            {nKo > 0 && <li className="ko"><span>⚠️ Échecs</span><b>{nKo}</b></li>}
          </ul>
          {nKo > 0 && (
            <button type="button" className="btn-ressayer" disabled={busy}
                    onClick={() => importer(lignes.filter((l) => faits.find((f) => f.bggId === l.jeu.bggId)?.resultat === 'echec'))}>
              🔁 Réessayer le jeu en échec
            </button>
          )}
          <Link className="btn-go as-link" href="/library">Voir ma ludothèque</Link>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Lien d'entrée** — dans `components/AddGameForm.tsx` : ajouter
      `import Link from 'next/link';` en tête, et sous `<p className="btn-note">…</p>`
      (ligne ~148) :

```tsx
<Link className="link-import" href="/games/import">Importer toute une collection (BGG) ›</Link>
```

- [ ] **Step 4: CSS** — append à `app/globals.css` (adapté de la maquette validée ; mêmes
      variables) :

```css
/* ── v3.6.0 — Import de collection BGG ── */
.imp-bloc { display: flex; flex-direction: column; gap: 12px; margin-top: 8px; }
.imp-sous { font-size: 13.5px; color: var(--doux-clair); line-height: 1.55; margin-top: 6px; }
.imp-bloc input { background: var(--surface); border: 1px solid color-mix(in srgb, var(--doux) 40%, transparent);
  border-radius: 12px; color: var(--creme); font: inherit; font-size: 15px; padding: 11px 13px; outline: none; }
.seg { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 8px 0 4px;
  background: var(--surface); border-radius: 14px; padding: 5px;
  border: 1px solid color-mix(in srgb, var(--doux) 35%, transparent); }
.seg button { background: none; border: 0; border-radius: 10px; padding: 7px 2px 5px;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  color: var(--doux-clair); cursor: pointer; font: inherit; }
.seg button .box { display: block; border-radius: 2.5px; background: currentColor; opacity: .85; }
.seg button .lbl { font-size: 11px; font-weight: 600; }
.seg button.on { background: var(--cuivre); color: var(--noyer); }
.imp-liste { list-style: none; display: flex; flex-direction: column; gap: 8px; margin: 10px 0 0; }
.imp-jeu { display: flex; gap: 11px; align-items: center; background: var(--surface);
  border: 1px solid color-mix(in srgb, var(--doux) 35%, transparent); border-radius: 14px; padding: 9px 11px; }
.imp-jeu .cover { width: 46px; height: 46px; border-radius: 9px; object-fit: cover; flex: 0 0 auto;
  background: var(--surface-plus); display: grid; place-items: center; }
.imp-jeu .mid { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.imp-jeu .titre { font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.imp-jeu .meta { font-size: 11.5px; color: var(--doux-clair); }
.imp-jeu .puce { flex: 0 0 auto; width: 22px; height: 22px; border-radius: 50%;
  border: 2px solid var(--doux); display: grid; place-items: center; font-size: 11px;
  color: transparent; background: none; cursor: pointer; padding: 0; }
.imp-jeu .puce[aria-pressed="true"] { background: var(--cuivre); border-color: var(--cuivre); color: var(--noyer); font-weight: 800; }
.imp-jeu.exclu { opacity: .45; }
.imp-jeu.exclu .fmt { display: none; }
.imp-jeu.fige { cursor: default; }
.imp-jeu.fige .cover { opacity: .5; filter: grayscale(.4); }
.badge { display: inline-flex; align-items: center; gap: 5px; border-radius: 999px; padding: 3px 9px;
  font-size: 10.5px; font-weight: 700; margin-top: 4px; width: fit-content; }
.badge.ok { background: color-mix(in srgb, var(--vert) 18%, transparent); color: var(--vert); }
.badge.dup { background: color-mix(in srgb, var(--ambre) 16%, transparent); color: var(--ambre); }
.badge.new { background: color-mix(in srgb, var(--cuivre) 16%, transparent); color: var(--cuivre); }
.choix-dup { display: inline-flex; background: var(--noyer); border-radius: 999px; padding: 3px;
  margin-top: 6px; border: 1px solid color-mix(in srgb, var(--doux) 45%, transparent); width: fit-content; }
.choix-dup button { background: none; border: 0; border-radius: 999px; color: var(--doux-clair);
  font: inherit; font-size: 10.5px; font-weight: 700; padding: 4px 9px; cursor: pointer; }
.choix-dup button.on { background: var(--ambre); color: var(--noyer); }
.choix-dup button.on.nouveau { background: var(--cuivre); }
.imp-jeu .fmt { flex: 0 0 auto; background: var(--noyer); border: 1px solid var(--doux);
  border-radius: 999px; color: var(--creme); font: inherit; font-size: 11px; font-weight: 700;
  padding: 5px 10px; cursor: pointer; }
.imp-bas { display: flex; flex-direction: column; gap: 4px; margin-top: 14px; }
.imp-encours { font-family: var(--font-display); font-size: 18px; font-weight: 800; margin-top: 10px; }
.imp-barre { height: 10px; background: var(--surface); border-radius: 999px; overflow: hidden; margin: 14px 0 6px; }
.imp-barre .fill { height: 100%; background: var(--cuivre); border-radius: 999px; transition: width .35s ease; }
.imp-num { font-size: 12px; color: var(--doux-clair); }
.imp-journal { list-style: none; display: flex; flex-direction: column; gap: 6px; margin-top: 14px; }
.imp-journal li { display: flex; align-items: center; gap: 10px; background: var(--surface);
  border-radius: 12px; padding: 8px 12px; font-size: 13px; font-weight: 600; }
.imp-journal .ico { width: 20px; text-align: center; }
.imp-journal li.ok .ico { color: var(--vert); }
.imp-journal li.enrichi .ico { color: var(--ambre); }
.imp-journal li.echec .ico { color: var(--rouge); }
.imp-journal li.echec { border: 1px solid color-mix(in srgb, var(--rouge) 45%, transparent); }
.imp-journal .pourquoi { margin-left: auto; font-size: 11px; color: var(--doux); font-weight: 400; }
.imp-recap { text-align: center; margin-top: 14px; }
.imp-recap .grand { font-size: 44px; }
.imp-recap h2 { font-family: var(--font-display); font-size: 21px; font-weight: 800; margin-top: 4px; }
.imp-stats { list-style: none; display: flex; flex-direction: column; gap: 7px; margin: 16px 0 0; }
.imp-stats li { display: flex; align-items: center; justify-content: space-between; gap: 12px;
  background: var(--surface); border-radius: 14px; padding: 12px 14px; font-size: 13.5px; font-weight: 600; }
.imp-stats b { font-family: var(--font-display); font-size: 21px; font-weight: 800; }
.imp-stats li.ok b { color: var(--vert); }
.imp-stats li.enr b { color: var(--ambre); }
.imp-stats li.dup b { color: var(--doux-clair); }
.imp-stats li.ko { border: 1px solid color-mix(in srgb, var(--rouge) 45%, transparent); }
.imp-stats li.ko b { color: var(--rouge); }
.btn-ressayer { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%;
  margin-top: 10px; background: var(--surface-plus); border: 1px solid var(--rouge); border-radius: 14px;
  color: var(--creme); font: inherit; font-size: 14px; font-weight: 700; padding: 12px; cursor: pointer; }
a.btn-go.as-link { display: flex; align-items: center; justify-content: center; text-decoration: none; margin-top: 10px; }
.link-import { display: block; text-align: center; margin-top: 12px; color: var(--cuivre);
  font-size: 13.5px; font-weight: 700; text-decoration: none; }
```

- [ ] **Step 5: Vérifs** — `npx tsc --noEmit` + `npm run build` (build Next avec la sync
      `sw.js`) → verts. Vérif manuelle rapide en local si un serveur de dev tourne :
      `/games/import` affiche l'écran pseudo, le lien apparaît sous le formulaire d'ajout.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(import-bgg): parcours /games/import — pseudo, preview, boucle, récap + lien depuis Ajouter (T5)"`

---

### Task 6: E2E — parcours complet, relance idempotente, échec + réessai

**Files:**
- Test: `tests/e2e/import-bgg.spec.ts`

**Interfaces:**
- Consumes: tous les hooks T5 ; `page.request.post('/api/games', { form })` (session partagée
  avec la page, `req.formData()` parse l'urlencoded) pour poser les jeux « existants » sans
  passer par l'UI ; mocks Playwright sur NOS routes (`**/api/bgg/collection*`,
  `**/api/bgg/thing*`) — pattern `ajout.spec.ts:24-26`.
- Produces: la preuve d'acceptation de la spec (parcours, dédoublonnage, idempotence, échec).

- [ ] **Step 1: Spec E2E** — créer `tests/e2e/import-bgg.spec.ts` :

```ts
import { test, expect } from '@playwright/test';

// Import de collection BGG (v3.6.0) : BGG simulé au niveau de NOS routes (pas de token en CI).
const stamp = Date.now().toString(36);
const pseudo = `imp-${stamp}`.slice(0, 20);

const COLLECTION = {
  jeux: [
    { bggId: 174430, titre: 'Gloomhaven', annee: 2017, thumb: null },
    { bggId: 266192, titre: 'Wingspan', annee: 2019, thumb: null },
    { bggId: 13, titre: 'Catan', annee: 1995, thumb: null },
  ],
};
const THING = (id: number, titre: string, cover: string | null) => ({
  bggId: id, title: titre, year: 2019, publisher: 'Éditeur', minPlayers: 2, maxPlayers: 5,
  playtimeMin: 60, weight: 2.4, rating: 8, designer: 'Autrice', artist: 'Artiste',
  bestPlayers: 4, coverName: cover,
});

async function register(page: import('@playwright/test').Page, p: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(p);
  await page.getByLabel('Code secret').fill('1234');
  const done = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await done;
}

test('import : preview dédoublonnée -> import -> enrichissement -> ludothèque', async ({ page }) => {
  await page.route('**/api/bgg/collection*', (r) => r.fulfill({ json: COLLECTION }));
  await page.route('**/api/bgg/thing*', (r) => {
    const id = Number(new URL(r.request().url()).searchParams.get('id'));
    return r.fulfill({ json: THING(id, id === 174430 ? 'Gloomhaven' : 'Wingspan', id === 174430 ? `import-${stamp}.jpg` : null) });
  });
  await register(page, pseudo);
  // Fiche manuelle « Wingspan » (sans bgg_id) + « Catan » déjà lié à BGG (bgg_id 13)
  await page.request.post('/api/games', { form: { title: 'Wingspan', box_format: 'moyen' } });
  await page.request.post('/api/games', { form: { title: 'Catan', box_format: 'grand', bgg_id: '13' } });

  await page.goto('/games/import');
  await page.getByLabel('Pseudo BGG').fill('quelquun');
  await page.getByRole('button', { name: 'Récupérer ma collection' }).click();

  // Preview : les 3 états
  await expect(page.getByText('Déjà dans ta ludothèque')).toBeVisible();            // Catan (bgg_id 13)
  await expect(page.getByText('Doublon probable')).toBeVisible();                   // Wingspan (manuel)
  await expect(page.getByText('+ Nouveau')).toHaveCount(1);                         // Gloomhaven
  await expect(page.getByRole('button', { name: 'Importer Gloomhaven' })).toBeVisible();
  // Format global -> moyen, pastille par ligne suit
  await page.getByRole('button', { name: 'Moyen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Format de Gloomhaven : moyen' })).toBeVisible();
  // Le doublon probable reste en enrichir : pas de pastille format pour lui
  await expect(page.getByRole('button', { name: /Format de Wingspan/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Importer 2 jeux' }).click();
  await expect(page.getByText('Collection importée ✓')).toBeVisible();
  await expect(page.locator('.imp-stats li.enr b')).toHaveText('1');
  await expect(page.locator('.imp-stats li.ok b')).toHaveText('1');

  // Ludothèque : toujours 2 fiches (pas de doublon Wingspan), Wingspan enrichie
  const api = await page.request.get('/api/games');
  const { games } = await api.json();
  expect(games).toHaveLength(2);
  const ws = games.find((g: { title: string }) => g.title === 'Wingspan');
  expect(ws.bgg_id).toBe(266192);         // enrichi
  expect(ws.box_format).toBe('moyen');    // intact (Review Focus n°4)
  const gh = games.find((g: { title: string }) => g.title === 'Gloomhaven');
  expect(gh.bgg_id).toBe(174430);
  expect(gh.box_format).toBe('moyen');    // format choisi
  expect(gh.cover_path).toBe(`import-${stamp}.jpg`);
});

test('import : relance idempotente — tout devient « déjà présent », rien à importer', async ({ page }) => {
  await page.route('**/api/bgg/collection*', (r) => r.fulfill({ json: COLLECTION }));
  await page.route('**/api/bgg/thing*', (r) => {
    const id = Number(new URL(r.request().url()).searchParams.get('id'));
    return r.fulfill({ json: THING(id, 'X', null) });
  });
  await register(page, `rel-${stamp}`.slice(0, 20));
  await page.request.post('/api/games', { form: { title: 'Wingspan', box_format: 'moyen' } });
  await page.request.post('/api/games', { form: { title: 'Catan', box_format: 'grand', bgg_id: '13' } });

  // Premier import complet
  await page.goto('/games/import');
  await page.getByLabel('Pseudo BGG').fill('quelquun');
  await page.getByRole('button', { name: 'Récupérer ma collection' }).click();
  await page.getByRole('button', { name: 'Importer 2 jeux' }).click();
  await expect(page.getByText('Collection importée ✓')).toBeVisible();

  // Relance (épingles Review Focus n°3) : Wingspan enrichie (bgg_id posé) redevient « déjà présente »
  await page.goto('/games/import');
  await page.getByLabel('Pseudo BGG').fill('quelquun');
  await page.getByRole('button', { name: 'Récupérer ma collection' }).click();
  await expect(page.getByText('Déjà dans ta ludothèque')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Rien à importer' })).toBeDisabled();
});

test('import : un échec n\u2019arrête pas la boucle — réessai rejoue seulement l\u2019échec', async ({ page }) => {
  await page.route('**/api/bgg/collection*', (r) => r.fulfill({ json: COLLECTION }));
  await register(page, `ech-${stamp}`.slice(0, 20));
  await page.request.post('/api/games', { form: { title: 'Catan', box_format: 'grand', bgg_id: '13' } });
  // Gloomhaven (174430) échoue (502), Wingspan (266192) passe — échec en milieu de boucle
  await page.route('**/api/bgg/thing*', (r) => {
    const id = Number(new URL(r.request().url()).searchParams.get('id'));
    return r.fulfill({ status: id === 174430 ? 502 : 200,
      json: id === 174430 ? { error: 'Fiche BGG indisponible' } : THING(id, 'Wingspan', null) });
  });

  await page.goto('/games/import');
  await page.getByLabel('Pseudo BGG').fill('quelquun');
  await page.getByRole('button', { name: 'Récupérer ma collection' }).click();
  await page.getByRole('button', { name: 'Importer 2 jeux' }).click();
  await expect(page.getByText('Presque tout est importé')).toBeVisible();
  await expect(page.locator('.imp-stats li.ko b')).toHaveText('1');
  await expect(page.locator('.imp-stats li.ok b')).toHaveText('1');

  // Réessai : seul l'échec est rejoué (épingles Review Focus n°5)
  await page.unroute('**/api/bgg/thing*');
  await page.route('**/api/bgg/thing*', (r) =>
    r.fulfill({ json: THING(Number(new URL(r.request().url()).searchParams.get('id')), 'Gloomhaven', null) }));
  await page.getByRole('button', { name: 'Réessayer le jeu en échec' }).click();
  await expect(page.getByText('Collection importée ✓')).toBeVisible();
  const api = await page.request.get('/api/games');
  const { games } = await api.json();
  expect(games).toHaveLength(3); // Catan + Wingspan (1er passage) + Gloomhaven (réessai)
});
```

- [ ] **Step 2: Vert** — `npx playwright test tests/e2e/import-bgg.spec.ts` → 3/3 PASS.
      Ajuster uniquement les sélecteurs si un `aria-label` a glissé (jamais l'inverse :
      ce sont les hooks de l'interface E2E).

- [ ] **Step 3: Suites adjacentes + full** — `npx playwright test tests/e2e/ajout.spec.ts
      tests/e2e/biblio.spec.ts` (aucune régression sur l'ajout/ludothèque) puis FULL :
      `npx vitest run` + `npx playwright test` + `npx tsc --noEmit` + `npm run build`.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "test(import-bgg): E2E parcours, relance idempotente, échec+réessai (T6)"`

---

### Task 7: Version 3.6.0 + CHANGELOG + backlog

**Files:**
- Modify: `package.json` (`"version": "3.6.0"`)
- Modify: `CHANGELOG.md` (entrée 3.6.0 en tête)
- Modify: `futur-feature.md` (annotations ✓ + date d'en-tête)

**Interfaces:**
- Consumes: T1–T6 (tout est en place, suites vertes).
- Produces: version `3.6.0` (UserMenu, `sw.js` `wsp-v3.6.0` via `scripts/sync-sw-version.mjs`
  au build).

- [ ] **Step 1: CHANGELOG** — entrée en tête (après l'introduction) :

```markdown
## [3.6.0] — 2026-10-03

### Ajouté
- **Import de collection BGG** : depuis « Ajouter », un lien « Importer toute une
  collection » — ton pseudo BGG préremplit la ludothèque avec les jeux que tu
  possèdes. Preview avec pochettes et doublons repérés, format de boîte choisi
  globalement (défaut « grand ») et ajustable boîte par boîte, import ~1 s par jeu
  avec progression. Relançable à volonté : les jeux déjà présents sont ignorés et
  une fiche saisie à la main du même titre est enrichie (joueurs, durée, poids,
  pochette) plutôt que doublée — un échec ne bloque jamais le reste.
```

- [ ] **Step 2: backlog** — dans `futur-feature.md` : en-tête « Dernière mise à jour :
      2026-10-03 » ; dans la table de l'ordre suggéré, annoter `#1` « ✓ v3.5.0 » et `#3`
      « ✓ v3.6.0 » dans la colonne Feature (les sections détaillées restent, l'historique
      vit au CHANGELOG).

- [ ] **Step 3: Version + suites** — `package.json` → `"3.6.0"`. Puis TOUTES les suites de
      référence : `npx vitest run`, `npx playwright test`, `npx tsc --noEmit`,
      `npm run build` — tout vert avant de pousser.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "chore: v3.6.0"`

- [ ] **Step 5: Release (contrôleur)** — push, PR, deux runs CI verts, merge, tag `v3.6.0`
      après CI main verte, release GitHub Latest, vérifier
      `curl -s https://etagere.marc-suarez.fr/sw.js | grep -o "wsp-v[0-9.]*"` = `wsp-v3.6.0`.
