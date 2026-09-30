# Soirées programmées, étagère collective & WhatsApp — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Étagère collective filtrable (recherche, joueurs/complexité/durée, « apporté par », « Pas ce soir »), soirées programmées avec QG, et messages WhatsApp pré-remplis (invitation + résultat du tirage).

**Architecture:** Deux PR séquentielles. **Vague 1** (étagère) : table `night_excludes`, filtrage serveur de `getShelfGames`, recherche/filtres en client (`lib/filters.ts` pur), badge propriétaire via jointure. **Vague 2** (soirées) : colonne `nights.start_time`, nuit active généralisée (n'importe quelle soirée du jour où je participe), QG en 3 sections, composition de messages pure (`lib/announce.ts`), partage via Web Share API / wa.me.

**Tech Stack:** Next.js App Router, better-sqlite3, Vitest, Playwright.

**Spec:** Maquette validée `.superpowers/brainstorm/52992-1790804838/content/soirees-whatsapp-v2.html`. Décisions validées :
1. « Pas ce soir » par jeu, **portée soirée** (revient seul à la prochaine), depuis la fiche étagère ET les cartes de bibliothèque ; section « Écartés ce soir » en bas de l'étagère.
2. Filtres : recherche titre ; **joueurs pré-rempli par la soirée** ; complexité (légère < 2, moyenne 2–3, lourde ≥ 3 — poids BGG) ; durée (< 30, 30–60, 60+).
3. Badge « apporté par » (sticker/avatar du propriétaire) sur chaque boîte.
4. QG Soirées : Ce soir · Programmées (date + heure + joueurs) · Historique ; le jour J la programmée devient la soirée en cours **automatiquement**.
5. WhatsApp : **pas de bot** — message composé par l'app, envoi via partage natif (`navigator.share`) sinon lien `wa.me`. Deux moments : invitation (à la programmation), résultat (au verdict du tirage).

## Global Constraints

- UI 100 % français ; palette noyer/crème/cuivre/vert ; Bricolage Grotesque + Space Grotesk.
- Migrations idempotentes (try/catch ALTER) dans `getDb()`. PRAGMA foreign_keys ON.
- Tests unitaires Vitest (DB temporaire `DATA_DIR`, `fileParallelism: false`) — assertions **scopées aux lignes du test** (DB partagée).
- E2E Playwright : auth UI (`getByLabel('Pseudo')` / `getByLabel('Code secret')`) ; **attendre les POST** avant toute navigation (`waitForResponse`).
- Les jeux vont sur l'étagère parce que leur propriétaire participe à la soirée (`night_players`) — inchangé.
- Version → 1.3.0 (vague 1) puis 1.4.0 (vague 2), CHANGELOG Keep a Changelog FR.

## Review Focus

1. **Fuite d'exclusion** : une exclusion est liée à `(night_id, game_id)` — ne jamais filtrer via l'exclusion d'une AUTRE nuit. Test unitaire croisé (2 nuits).
2. **Partage natif** : `navigator.share` exige un geste utilisateur et https — bouton cliqué uniquement ; fallback wa.me avec `encodeURIComponent` (emojis sûrs). Test : composition du message pure.
3. **Jour J** : la nuit active se calcule avec `date('now','localtime')` (cohérent avec l'existant) — une programmée datée aujourd'hui EST la nuit active. Test unitaire + E2E.
4. **Compat POST /api/nights** : l'extension (date/heure facultatives) ne doit pas casser le flow NightPicker actuel (E2E existants = garde-fou).
5. **Échelle des filtres** : le filtre joueurs utilise `min/max` ; un jeu `min>soirée` ou `max<soirée` doit disparaître. Test pur sur `lib/filters.ts`.

---

# VAGUE 1 — Étagère collective & « Pas ce soir » (PR `feat/etagere-collective`)

### Task 1: Schéma night_excludes + logique lib

**Files:**
- Modify: `lib/db.ts` (SCHEMA + migrations), `lib/nights.ts`, `lib/types.ts`
- Test: `tests/unit/excludes.test.ts`

**Interfaces:**
- Produces: `excludeGame(nightId: number, gameId: number): void`, `restoreGame(nightId: number, gameId: number): void`, `getExcludedGameIds(nightId: number): number[]` ; `getShelfGames` ne renvoie PLUS les jeux exclus et enrichit chaque jeu avec `owner_pseudo: string`, `owner_sticker: string | null`, `owner_avatar_path: string | null` (type `Game` étendu).

- [ ] **Step 1: Test qui échoue**

```ts
// tests/unit/excludes.test.ts
import { describe, it, expect } from 'vitest';
import { registerUser } from '@/lib/auth';
import { createNight, getShelfGames, excludeGame, restoreGame, getExcludedGameIds } from '@/lib/nights';
import { createGame } from '@/lib/games';
import { getDb } from '@/lib/db';

const uid = (p: string) => (registerUser(p, '1234') as { id: number }).id;

describe('pas ce soir', () => {
  it('exclut un jeu d une nuit SANS toucher aux autres nuits', () => {
    const marc = uid('x-marc');
    const g1 = createGame(marc, { title: 'Azul', box_format: 'petit' });
    const g2 = createGame(marc, { title: 'Dune', box_format: 'grand' });
    const n1 = createNight(marc, [marc]);
    const n2 = createNight(marc, [marc]);
    excludeGame(n1, g1);
    expect(getExcludedGameIds(n1)).toEqual([g1]);
    expect(getExcludedGameIds(n2)).toEqual([]); // portée soirée seulement
    expect(getShelfGames(n1).map((g) => g.id)).toEqual([g2]);
    expect(getShelfGames(n2).map((g) => g.id).sort()).toEqual([g1, g2].sort());
    restoreGame(n1, g1);
    expect(getShelfGames(n1).map((g) => g.id).sort()).toEqual([g1, g2].sort());
  });

  it('l exclusion disparaît avec la nuit (cascade)', () => {
    const marc = uid('x-casc');
    const g = createGame(marc, { title: 'Jaipur', box_format: 'mini' });
    const n = createNight(marc, [marc]);
    excludeGame(n, g);
    getDb().prepare('DELETE FROM nights WHERE id = ?').run(n);
    expect(Number((getDb().prepare('SELECT COUNT(*) AS n FROM night_excludes').get() as { n: number }).n)).toBe(0);
  });

  it('l étagère expose le propriétaire (pseudo + sticker)', () => {
    const marc = uid('x-owner');
    const lea = uid('x-owner-lea');
    getDb().prepare("UPDATE users SET sticker = '🦊' WHERE id = ?").run(marc);
    createNight(marc, [marc, lea]);
    const g = createGame(marc, { title: 'Meadow', box_format: 'moyen' });
    const shelf = getShelfGames(createNight(marc, [marc, lea]) + 0 ? 0 : 0); // placeholder remplacé ci-dessous
    void shelf;
    const n = getDb().prepare('SELECT id FROM nights WHERE creator_id = ? ORDER BY id DESC').get(marc) as { id: number };
    const row = getShelfGames(n.id).find((x) => x.id === g.id);
    expect(row?.owner_pseudo).toBe('x-owner');
    expect(row?.owner_sticker).toBe('🦊');
  });
});
```
(Nettoyer le test 3 : supprimer la ligne placeholder avant commit — ne garder que la requête `n`.)

- [ ] **Step 2: Vérifier l'échec** — `npx vitest run tests/unit/excludes.test.ts` → FAIL (exports absents).
- [ ] **Step 3: Implémenter**

```sql
-- lib/db.ts : dans SCHEMA, nouvelle table :
CREATE TABLE IF NOT EXISTS night_excludes (
  night_id INTEGER NOT NULL REFERENCES nights(id) ON DELETE CASCADE,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  UNIQUE(night_id, game_id)
);
```

```ts
// lib/nights.ts — getShelfGames remplacé :
export function getShelfGames(nightId: number): (Game & { owner_pseudo: string; owner_sticker: string | null; owner_avatar_path: string | null })[] {
  return getDb().prepare(`
    SELECT DISTINCT g.*, u.pseudo AS owner_pseudo, u.sticker AS owner_sticker, u.avatar_path AS owner_avatar_path
    FROM games g
    JOIN night_players np ON np.user_id = g.owner_id
    JOIN users u ON u.id = g.owner_id
    WHERE np.night_id = ?
      AND g.id NOT IN (SELECT game_id FROM night_excludes WHERE night_id = ?)
    ORDER BY CASE g.box_format WHEN 'grand' THEN 0 WHEN 'moyen' THEN 1 WHEN 'petit' THEN 2 ELSE 3 END, g.title`)
    .all(nightId, nightId) as never;
}
export function excludeGame(nightId: number, gameId: number): void {
  getDb().prepare('INSERT OR IGNORE INTO night_excludes (night_id, game_id) VALUES (?, ?)').run(nightId, gameId);
}
export function restoreGame(nightId: number, gameId: number): void {
  getDb().prepare('DELETE FROM night_excludes WHERE night_id = ? AND game_id = ?').run(nightId, gameId);
}
export function getExcludedGameIds(nightId: number): number[] {
  return (getDb().prepare('SELECT game_id FROM night_excludes WHERE night_id = ? ORDER BY game_id').all(nightId) as { game_id: number }[]).map((r) => r.game_id);
}
```
(`lib/types.ts` : `export interface Game { … owner_pseudo?: string; owner_sticker?: string | null; owner_avatar_path?: string | null; }`)

- [ ] **Step 4: PASS** — suite unitaire complète.
- [ ] **Step 5: Commit** — `feat: night_excludes — étagère filtrée par nuit + propriétaire exposé`

### Task 2: API /api/nights/[id]/excludes

**Files:**
- Create: `app/api/nights/[id]/excludes/route.ts` (POST { gameId, excluded: boolean })
- Test: `tests/unit/excludes.test.ts` (ajout d'un garde : nuit inaccessible → refus applicatif ; le handler vérifie via `userCanAccessNight`)

**Interfaces:**
- POST body `{ gameId: number; excluded: boolean }` ; 401 hors session ; 403 si `!userCanAccessNight(user.id, nightId)` ; 400 si le jeu n'est pas sur l'étagère de la nuit (pas propriétaire d'un participant).
- Réponse `{ ok: true }`.

- [ ] **Step 1: Test du garde applicatif (lib-level, pattern repo)**

```ts
it('on n exclut pas un jeu hors de l étagère de la nuit', () => {
  const marc = uid('x-garde');
  const autre = uid('x-garde-autre');
  const g = createGame(autre, { title: 'Loin', box_format: 'petit' });
  const n = createNight(marc, [marc]);
  expect(() => {
    // la route validera : le jeu doit appartenir à un participant
    const ok = !!getDb().prepare(`
      SELECT 1 FROM games g JOIN night_players np ON np.user_id = g.owner_id
      WHERE g.id = ? AND np.night_id = ?`).get(g, n);
    if (!ok) throw new Error('jeu hors étagère');
  }).toThrow('jeu hors étagère');
});
```

- [ ] **Step 2: Implémenter la route**

```ts
// app/api/nights/[id]/excludes/route.ts
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getDb } from '@/lib/db';
import { userCanAccessNight, excludeGame, restoreGame } from '@/lib/nights';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const { id } = await params;
  const nightId = Number(id);
  if (!Number.isInteger(nightId) || !userCanAccessNight(user.id, nightId))
    return NextResponse.json({ error: 'Soirée inaccessible' }, { status: 403 });
  const { gameId, excluded } = await req.json();
  if (!Number.isInteger(gameId))
    return NextResponse.json({ error: 'Jeu invalide' }, { status: 400 });
  const onShelf = !!getDb().prepare(`
    SELECT 1 FROM games g JOIN night_players np ON np.user_id = g.owner_id
    WHERE g.id = ? AND np.night_id = ?`).get(gameId, nightId);
  if (!onShelf) return NextResponse.json({ error: 'Jeu hors étagère' }, { status: 400 });
  excluded ? excludeGame(nightId, gameId) : restoreGame(nightId, gameId);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: PASS + commit** — `feat: API exclusion de jeu pour une soirée`

### Task 3: « Pas ce soir » dans la fiche + section Écartés (étagère)

**Files:**
- Modify: `components/GameSheet.tsx` (mode shelf), `components/ShelfClient.tsx`, `app/etagere/page.tsx`
- Modify: `app/globals.css` (`.box.ex`, section écartés)
- Test: `tests/e2e/etagere-selection.spec.ts` (extension) ou nouveau `tests/e2e/pas-ce-soir.spec.ts`

**Interfaces:**
- `GameSheet` reçoit `nightId`, `excluded: boolean`, `onToggleExcluded(): void` — bouton ghost rouge « Pas ce soir — écarte du tirage » / « ↩ Remettre ce soir ».
- `ShelfClient` reçoit `excludedGames: Game[]` (même enrichi propriétaire) — section « Écartés ce soir (N) » sous les blocs, boîtes `.box.ex`, tap → fiche (avec bouton remettre). Le toggle appelle POST `/api/nights/[id]/excludes` puis `router.refresh()`.

- [ ] **Step 1: E2E qui échoue** — créer un jeu, ouvrir sa fiche, cliquer « Pas ce soir » → la boîte quitte les blocs et apparaît dans « Écartés ce soir (1) » ; depuis la fiche écartée, « Remettre ce soir » la restitue ; assertion sur le compteur `Sélection` inchangée et l'absence de la boîte dans les blocs (`locator('.shelf-block .box', { hasTitle })` count 0 puis section `.excluded-row .box` count 1).
- [ ] **Step 2: Implémenter** (fiche + section + refresh).
- [ ] **Step 3: PASS + commit** — `feat: « Pas ce soir » depuis la fiche + section écartés`

### Task 4: « Pas ce soir » dans la bibliothèque

**Files:**
- Modify: `app/library/page.tsx` (passer nuit active + ids exclus), `components/LibraryClient.tsx`
- Test: E2E (même spec)

**Interfaces:**
- La page bibliothèque reçoit `activeNightId: number | null` et `excludedIds: number[]` ; chaque carte affiche la pilule « Pas ce soir » / « ✓ Écarté ce soir » (uniquement si `activeNightId`), même POST + `router.refresh()`.

- [ ] **Step 1: E2E** — bibliothèque : pilule visible, clic → état « ✓ Écarté ce soir », le jeu quitte l'étagère (vérif croisée via `page.goto('/etagere')`).
- [ ] **Step 2: Implémenter. Step 3: PASS + commit** — `feat: « Pas ce soir » sur les cartes de bibliothèque`

### Task 5: Recherche + filtres (client) sur l'étagère

**Files:**
- Create: `lib/filters.ts` (pur, testable), `components/ShelfControls.tsx`
- Modify: `components/ShelfClient.tsx`, `app/globals.css`
- Test: `tests/unit/filters.test.ts`

**Interfaces:**
- Produces: `filterShelf(games: Game[], opts: { q: string; players: number | null; weight: 'all' | 'leger' | 'moyen' | 'lourd'; duration: 'all' | 'court' | 'moyen' | 'long' }): Game[]` (weight : légère < 2, moyenne [2,3[, lourde ≥ 3 ; duration : court < 30, moyen [30,60], long > 60 — `null` playtime passe tous les filtres durée).
- `ShelfControls` : barre recherche + chips (joueurs 1..5, complexité, durée — un choix par famille, toggle pour désactiver). Joueurs pré-rempli avec `players.length`. Compteur « N jeux sur M disponibles ce soir ».

- [ ] **Step 1: Tests purs**

```ts
// tests/unit/filters.test.ts
import { filterShelf } from '@/lib/filters';
const g = (o: Partial<Game>): Game => ({ id: 1, owner_id: 1, bgg_id: null, title: 'X', year: null, publisher: null,
  cover_url: null, cover_path: null, min_players: 1, max_players: 5, playtime_min: 45, weight: 2.5, bgg_rating: null,
  box_format: 'moyen', created_at: '', designer: null, artist: null, best_players: null, ...o });
const base = [g({ id: 1, title: 'Azul', min_players: 2, max_players: 4, weight: 1.7, playtime_min: 35 }),
              g({ id: 2, title: 'Mars', min_players: 1, max_players: 5, weight: 3.2, playtime_min: 120 }),
              g({ id: 3, title: 'Jaipur', min_players: 2, max_players: 2, weight: 1.6, playtime_min: 30 })];
it('recherche insensible à la casse', () => expect(filterShelf(base, { q: 'azu', players: null, weight: 'all', duration: 'all' }).map((x) => x.id)).toEqual([1]));
it('filtre joueurs : min/max encadrent', () => expect(filterShelf(base, { q: '', players: 3, weight: 'all', duration: 'all' }).map((x) => x.id)).toEqual([1, 2]));
it('complexité lourde', () => expect(filterShelf(base, { q: '', players: null, weight: 'lourd', duration: 'all' }).map((x) => x.id)).toEqual([2]));
it('durée courte (<30) : 30 min inclus dans moyen', () => expect(filterShelf(base, { q: '', players: null, weight: 'all', duration: 'court' })).toEqual([]));
it('sans playtime, la durée ne filtre pas', () => expect(filterShelf([g({ id: 4, playtime_min: null })], { q: '', players: null, weight: 'all', duration: 'court' }).map((x) => x.id)).toEqual([4]));
```

- [ ] **Step 2: Implémenter lib + composant + intégration ShelfClient.** CSS chips `.fchip` (cuivre quand actif).
- [ ] **Step 3: E2E** — pré-filtre joueurs visible (chips actifs), recherche « azul » → 1 boîte, compteur correct.
- [ ] **Step 4: PASS + commit** — `feat: recherche et filtres sur l étagère`

### Task 6: Badge « apporté par » sur les boîtes

**Files:**
- Create: `components/OwnerBadge.tsx` ; Modify: `components/ShelfClient.tsx`, `app/globals.css`
- Test: E2E (étendre pas-ce-soir.spec : `data-owner` visible)

**Interfaces:**
- Boîte : petit rond 16px coin bas-droit — `avatarSrc(owner)` sinon `owner.sticker ?? '♟'` ; `title="Apporté par {pseudo}"`.

- [ ] **Step 1: Implémenter + E2E** (assert `getComputedStyle` 16px + title).
- [ ] **Step 2: PASS + commit** — `feat: badge « apporté par » sur les boîtes`

### Task 7: Version 1.3.0 + PR

- [ ] Bump `package.json` 1.3.0, CHANGELOG (`### Ajouté` : pas ce soir, recherche/filtres, badge propriétaire ; `### Modifié` : étagère filtrée par exclusions). Full suite verte. Commit + PR + CI.

---

# VAGUE 2 — Soirées programmées & WhatsApp (PR `feat/soirees-programmees`)

### Task 8: Nuits programmées (schéma + logique)

**Files:**
- Modify: `lib/db.ts` (`ALTER TABLE nights ADD COLUMN start_time TEXT`), `lib/nights.ts`, `lib/types.ts`
- Test: `tests/unit/planned.test.ts`

**Interfaces:**
- Produces: `getActiveNight(userId)` remplace `getCurrentNight` (nuit datée aujourd'hui où je suis créateur **ou joueur**) ; `getPlannedNights(userId): Night[]` (played_at > aujourd'hui, créateur ou joueur) ; `Night.start_time?: string | null` ; `createNight(creatorId, playerIds, opts?: { playedAt?: string; startTime?: string | null })`.
- Jour J automatique : une nuit programmée datée aujourd'hui EST la nuit active (aucun état à muter).

- [ ] **Step 1: Tests** — programmée demain → pas dans l'étagère du jour mais dans `getPlannedNights` des deux participants ; reprogrammée aujourd'hui → devient la nuit active ; `getActiveNight` pour un simple joueur (non créateur).
- [ ] **Step 2: Implémenter** — `getActiveNight` :

```ts
export function getActiveNight(userId: number): Night | null {
  return (getDb().prepare(`
    SELECT n.* FROM nights n
    WHERE n.played_at = date('now','localtime')
      AND (n.creator_id = ? OR EXISTS (SELECT 1 FROM night_players np WHERE np.night_id = n.id AND np.user_id = ?))
    ORDER BY n.id DESC LIMIT 1`).get(userId, userId) as Night | undefined) ?? null;
}
```
- [ ] **Step 3: PASS + commit** — `feat: soirées programmées (schéma + nuit active généralisée)`

### Task 9: API + QG Soirées (3 sections + programmation)

**Files:**
- Modify: `app/api/nights/route.ts` (POST accepte `playedAt`/`startTime` facultatifs — validation : date ISO, pas dans le passé, joueurs doivent inclure le créateur), `app/nights/page.tsx`, `components/NightPlanner.tsx` (nouveau), `components/TabBar.tsx` (rien — /nights déjà l'onglet)
- Test: E2E `tests/e2e/soirees.spec.ts`

**Interfaces:**
- Page Soirées : « Ce soir » (nuit active), « Programmées » (cartes : date longue fr, heure, chips joueurs, bouton « 💬 Inviter sur WhatsApp » → Task 11), « Historique ». Bouton « ＋ Programmer une soirée » → sheet : date (min = demain), heure, joueurs cochés (NightPicker réutilisé ou liste simple) → POST → refresh.
- `getMyNights` reste pour l'historique (filtrer played_at ≤ aujourd'hui).

- [ ] **Step 1: E2E** — programmer demain 20h avec 2 joueurs → carte visible dans Programmées ; **elle n'apparaît pas sur l'étagère** ; reprogrammer aujourd'hui → l'étagère l'utilise comme soirée en cours (test du jour J).
- [ ] **Step 2: Implémenter. Step 3: PASS (toute la suite — garde-fou NightPicker) + commit** — `feat: QG soirées — programmation avec date/heure`

### Task 10: Composition des messages (lib pure)

**Files:**
- Create: `lib/announce.ts`
- Test: `tests/unit/announce.test.ts`

**Interfaces:**
- `buildInviteMessage({ dateLong: string; time: string | null; pseudos: string[] }): string` →
  `🎲 Soirée jeux le {dateLong}{time ? ' à ' + time : ''} !\n👥 {pseudos.join(', ')} sont de la partie.\nMarquez vos jeux dispo 🔗 etagere.marc-suarez.fr`
- `buildResultMessage({ title: string; ownerPseudo: string; waiting: string[]; time: string | null }): string` →
  `🎲 {title} a été tiré au sort !\n👉 {ownerPseudo} ramène son jeu\n🕗 On attend {waiting.join(', ')}{time ? ' — ce soir à ' + time : ''}\n🔗 etagere.marc-suarez.fr`
- `shareMessage(text: string): Promise<'share' | 'wa.me'>` (client) : `navigator.share({ text })` si dispo, sinon `window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank')`.

- [ ] **Step 1: Tests** (textes exacts, jointure « A, B et C » pour 3+, cas 1 seul, heure absente).
- [ ] **Step 2: Implémenter. Step 3: PASS + commit** — `feat: composition des messages WhatsApp`

### Task 11: Bouton annonce au verdict + invitation sur cartes programmées

**Files:**
- Modify: `app/tirage/[nightId]/page.tsx` + `components/TirageClient.tsx` (verdict : bouton « 💬 Annoncer sur WhatsApp » → `buildResultMessage` : titre, owner du jeu tiré, participants sauf owner, start_time), `components/NightPlanner.tsx` / cartes programmées (invitation)
- Test: E2E `soirees.spec.ts` (mock `navigator.share` via `page.addInitScript` → assert appel avec le bon texte ; fallback : popup wa.me interceptée)

**Interfaces:**
- Le verdict reçoit du serveur : `ownerPseudo`, `waitingPseudos`, `startTime` — composition côté client au clic.

- [ ] **Step 1: E2E** — tirage d'un jeu possédé par marc avec léa et thibault présents → clic → `navigator.share` appelé avec message contenant titre + « marc ramène son jeu » + « On attend léa et thibault ».
- [ ] **Step 2: Implémenter. Step 3: PASS + commit** — `feat: annonce WhatsApp au verdict + invitations`

### Task 12: Version 1.4.0 + PR

- [ ] Bump + CHANGELOG (soirées programmées, QG, annonce WhatsApp, nuit active pour les participants). Suites vertes. PR + CI.

## Self-Review

- **Spec coverage:** pas ce soir (T1–T4), filtres+recherche (T5), badge (T6), programmées+jour J (T8–T9), QG (T9), messages+partage (T10–T11). Marges maquette : CSS T3/T5.
- **Types:** `filterShelf`, `excludeGame/restoreGame/getExcludedGameIds`, `getActiveNight/getPlannedNights`, `buildInviteMessage/buildResultMessage` — signatures reprises telles quelles dans les tâches consommatrices.
- **Review Focus:** 1→T1 (test croisé 2 nuits), 2→T10/T11, 3→T8/T9, 4→T9 (suite E2E complète = garde-fou), 5→T5.
