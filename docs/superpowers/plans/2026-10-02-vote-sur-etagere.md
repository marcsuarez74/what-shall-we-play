# Vote sur l'étagère 👍 — Plan d'implémentation (v3.5.0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chacun pose un 👍 révocable sur les boîtes qui lui font envie pendant la préparation ; au lancement, le créateur tire parmi tous les jeux ou seulement les votés — sans rien changer au rituel de l'étagère.

**Architecture:** Table `game_votes` (soirée × jeu × joueur, UNIQUE) dans `SCHEMA` → `toggleNightVote`/`getShelfVotes` dans `lib/nights.ts` (même contrat que `addNightGame`, `notifyNight` pour la sync live) → route fine `POST /api/nights/[id]/votes` → badge `<span>` cliquable dans chaque boîte + segmenté « Tous / Votés » dans la CTA du créateur validé. Le pool est un état client : `lancer()` passe à la roue une liste d'ids plus courte (`?games=`), rien d'autre ne change.

**Tech Stack:** Next.js App Router + TypeScript, better-sqlite3, Vitest, Playwright (workers 1).

**Spec:** `docs/superpowers/specs/2026-10-02-vote-sur-etagere-design.md` (lire avec ce plan — le plan argumente depuis la spec).

## Global Constraints

- UI 100 % français ; palette noyer `#2A1F17` / surface `#3A2B1F` / crème `#F3E9DC` / cuivre `#C96F3B` / vert `#3E9B6E` ; Bricolage Grotesque + Space Grotesque.
- **Aucune nouvelle dépendance npm.**
- Le badge vote est un **`<span>` cliquable DANS le `<button class="box">`** — jamais un bouton imbriqué (HTML invalide) ; `e.stopPropagation()` pour ne pas ouvrir la fiche jeu.
- **Voter ne touche jamais à `validated_at`** (seul l'ajout/retrait d'une boîte saute la validation, idiome v3.0.0).
- Le pool du tirage est **recalculé au clic** avec la garde `pool === 'votes' && votés.length > 0` ; hors branche du créateur validé, il vaut toujours « tous » (`poolActif = jAiValide ? pool : 'tous'`).
- Le lancement reste une **navigation document** `window.location.assign` (fix v3.3.1) ; la roue reçoit `?games=<ids>` et ne sait rien des votes.
- E2E : `DATA_DIR` hors projet via `playwright.config.ts` (déjà en place) ; workers 1 ; pseudos E2E ≤ 20 caractères ; **ne jamais éditer de fichiers pendant une suite** (Turbopack surveille la racine). Vitest : `fileParallelism: false`, `.tmp-vitest` déjà configuré.
- TDD strict : rouge observé puis vert. Suites de référence avant release : `npx vitest run`, `npx playwright test`, `npx tsc --noEmit`, `npm run build` ; deux runs CI verts avant merge ; tag après fusion.
- Navigation interne : `<Link>` de `next/link`.

## Review Focus

1. **Course sync live au lancement** : le créateur a choisi « Votés », une boîte votée est retirée (ou dé-votée) par un autre joueur au même moment → le pool recalculé au clic ne lance que les votés restants, jamais d'id fantôme dans `?games=`, et retombe sur tous si plus aucun vote. → Pin : T5 (E2E « dé-vote live avant lancer »).
2. **Deux joueurs votent sur le même jeu** : `UNIQUE(night_id, game_id, user_id)` + `INSERT OR IGNORE` → pas de doublon, total 2 ; re-toucher retire SON vote seulement. → Pin : T2 (unitaire « deux joueurs, total 2 »).
3. **Badge vs fiche jeu** : toucher le badge n'ouvre JAMAIS la fiche (stopPropagation) ; toucher la boîte hors badge ouvre toujours la fiche. → Pin : T4 (E2E « badge sans fiche »).
4. **Boîte ajoutée après validation** : la validation saute (idiome), le segmenté disparaît avec la branche, et le Lancer fantôme compte TOUS les jeux — jamais l'ancien choix « Votés ». → Pin : T5 (E2E « ajout tardif retombe sur tous »).
5. **Soirée `en_jeu` figée** : 409 « La partie a commencé » côté API, plus aucun badge rendu — un client déconnecté qui vote au réveil reçoit l'erreur en français, aucun crash. → Pin : T2 (unitaire 409) + T5 (E2E « gelé en jeu »).

---

### Task 1: Table `game_votes`

**Files:**
- Modify: `lib/db.ts` (SCHEMA — ajouter la table après `bug_reports`, avant `picks`)
- Test: `tests/unit/db.test.ts` (append)

**Interfaces:**
- Produces: table `game_votes` (voir SQL) — colonnes `night_id`, `game_id`, `user_id`, `created_at` (défaut localtime), contrainte `UNIQUE(night_id, game_id, user_id)`, CASCADE sur les trois FK.
- Consumed by: T2 (bascule, retrait, lecture), T3 (route).

- [ ] **Step 1: Test rouge** — append à `tests/unit/db.test.ts` :

```ts
it('v3.5 : table game_votes prête (UNIQUE par joueur, CASCADE, date locale)', () => {
  const db = getDb();
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map((r: { name: string }) => r.name);
  expect(tables).toContain('game_votes');
  const marc = db.prepare(`INSERT INTO users (pseudo, code_hash) VALUES ('gv-marc', 'x')`).run();
  const lea = db.prepare(`INSERT INTO users (pseudo, code_hash) VALUES ('gv-lea', 'x')`).run();
  const night = db.prepare(`INSERT INTO nights (creator_id) VALUES (?)`).run(marc.lastInsertRowid);
  const game = db.prepare(`INSERT INTO games (owner_id, title, box_format) VALUES (?, 'Azul', 'moyen')`).run(marc.lastInsertRowid);
  db.prepare(`INSERT INTO game_votes (night_id, game_id, user_id) VALUES (?, ?, ?)`)
    .run(night.lastInsertRowid, game.lastInsertRowid, marc.lastInsertRowid);
  const row = db.prepare('SELECT created_at FROM game_votes WHERE night_id = ?').get(night.lastInsertRowid) as { created_at: string };
  expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  // UNIQUE : le même joueur ne vote pas deux fois
  expect(() => db.prepare(`INSERT INTO game_votes (night_id, game_id, user_id) VALUES (?, ?, ?)`)
    .run(night.lastInsertRowid, game.lastInsertRowid, marc.lastInsertRowid)).toThrow();
  // deux joueurs peuvent voter le même jeu
  db.prepare(`INSERT INTO game_votes (night_id, game_id, user_id) VALUES (?, ?, ?)`)
    .run(night.lastInsertRowid, game.lastInsertRowid, lea.lastInsertRowid);
  // suppression de la partie → votes emportés (CASCADE)
  db.prepare('DELETE FROM nights WHERE id = ?').run(night.lastInsertRowid);
  expect(db.prepare('SELECT COUNT(*) AS t FROM game_votes').get() as { t: number }).toEqual({ t: 0 });
});
```

- [ ] **Step 2: Rouge** — `npx vitest run tests/unit/db.test.ts` → FAIL (`game_votes` absent de sqlite_master).

- [ ] **Step 3: Implémenter** — `lib/db.ts`, dans le `SCHEMA` juste après le bloc `bug_reports` :

```sql
-- v3.5.0 (vote sur l'étagère) : les envies du soir — UNIQUE par (soirée, jeu, joueur),
-- révocable (la bascule est dans lib/nights). Une boîte retirée emporte ses votes.
CREATE TABLE IF NOT EXISTS game_votes (
  night_id INTEGER NOT NULL REFERENCES nights(id) ON DELETE CASCADE,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(night_id, game_id, user_id)
);
```

- [ ] **Step 4: Vert** — `npx vitest run` (suite complète) → PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(votes): table game_votes — un vote par joueur et par jeu de la soirée"`

---

### Task 2: `lib/nights.ts` — `toggleNightVote`, `getShelfVotes`, nettoyage `removeNightGame`

**Files:**
- Modify: `lib/nights.ts` (bascule après `removeNightGame` ; `getShelfVotes` après `getShelfGames` ; DELETE dans `removeNightGame`)
- Test: `tests/unit/votes.test.ts` (create)

**Interfaces:**
- Consumes: T1 (table `game_votes`), existants `getNight`, `isNightParticipant`, `isGameOnShelf`, `notifyNight`, type `NightGameResult`.
- Produces (exact, pour T3/T4/T5) :
  - `export type ShelfVote = { game_id: number; user_id: number; pseudo: string }`
  - `export function toggleNightVote(nightId: number, gameId: number, userId: number): NightGameResult`
  - `export function getShelfVotes(nightId: number): ShelfVote[]`
  - Comportement `removeNightGame` : supprime aussi les votes du jeu retiré.
  - Garanties : garde 404 (partie) / 403 (non-participant, jeu hors étagère) / 409 (`en_jeu`) ; `validated_at` intact ; `notifyNight` appelé dans les deux sens de la bascule.

- [ ] **Step 1: Test rouge** — create `tests/unit/votes.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { registerUser } from '@/lib/auth';
import { createGame } from '@/lib/games';
import { getDb } from '@/lib/db';
import {
  createNight, addNightGame, removeNightGame, toggleNightVote,
  getShelfVotes, getNightPlayers, validateSelection,
} from '@/lib/nights';

const uid = (p: string) => (registerUser(p, '1234') as { id: number }).id;

describe('toggleNightVote', () => {
  it('bascule : vote → présent, re-vote → absent ; deux joueurs sur le même jeu → total 2', () => {
    const marc = uid('vt-marc'); const lea = uid('vt-lea');
    const g = createGame(marc, { title: 'Cascadia', box_format: 'grand' });
    const n = createNight(marc, [marc, lea]);
    addNightGame(n, g, marc);

    expect(toggleNightVote(n, g, marc)).toEqual({ ok: true });
    expect(getShelfVotes(n)).toEqual([{ game_id: g, user_id: marc, pseudo: 'vt-marc' }]);
    expect(toggleNightVote(n, g, lea)).toEqual({ ok: true }); // second joueur
    expect(getShelfVotes(n)).toHaveLength(2); // pas de doublon, pas de fusion

    expect(toggleNightVote(n, g, marc)).toEqual({ ok: true }); // retirer SON vote
    expect(getShelfVotes(n)).toHaveLength(1); // le vote de Léa reste
    expect(getShelfVotes(n)[0].pseudo).toBe('vt-lea');
  });

  it('gardes : partie inconnue 404, non-participant 403, jeu hors étagère 403, en_jeu 409', () => {
    const marc = uid('vt-gm'); const lea = uid('vt-gl'); const zarb = uid('vt-gz');
    const g = createGame(marc, { title: 'Wingspan', box_format: 'moyen' });
    const n = createNight(marc, [marc, lea]);
    addNightGame(n, g, marc);

    expect(toggleNightVote(99999, g, marc)).toEqual({ error: 'Partie introuvable', status: 404 });
    expect(toggleNightVote(n, g, zarb).status).toBe(403); // pas joueur de la soirée
    expect(toggleNightVote(n, g + 1, marc).status).toBe(403); // jeu pas sur l'étagère

    getDb().prepare(`UPDATE nights SET status = 'en_jeu' WHERE id = ?`).run(n);
    const r = toggleNightVote(n, g, marc);
    expect('error' in r && r.error).toBe('La partie a commencé — les votes sont figés');
    expect('error' in r && r.status).toBe(409);
  });

  it('voter ne saute jamais la validation (contrairement à l ajout/retrait d une boîte)', () => {
    const marc = uid('vt-val'); const lea = uid('vt-l2');
    const g = createGame(marc, { title: 'Azul', box_format: 'petit' });
    const n = createNight(marc, [marc, lea]);
    addNightGame(n, g, marc);
    validateSelection(n, marc);
    expect(getNightPlayers(n).find((p) => p.id === marc)?.validated_at).toBeTruthy();

    toggleNightVote(n, g, marc);
    toggleNightVote(n, g, marc); // dans les deux sens
    expect(getNightPlayers(n).find((p) => p.id === marc)?.validated_at).toBeTruthy();
  });

  it('une boîte retirée emporte ses votes (pas de vote fantôme)', () => {
    const marc = uid('vt-rm'); const lea = uid('vt-rl');
    const g = createGame(marc, { title: '7 Wonders', box_format: 'moyen' });
    const n = createNight(marc, [marc, lea]);
    addNightGame(n, g, marc);
    toggleNightVote(n, g, marc);
    toggleNightVote(n, g, lea);
    removeNightGame(n, g, marc);
    expect(getShelfVotes(n)).toEqual([]);
  });
});
```

- [ ] **Step 2: Rouge** — `npx vitest run tests/unit/votes.test.ts` → FAIL (`toggleNightVote` non exporté).

- [ ] **Step 3: Implémenter** — dans `lib/nights.ts` :

Juste après `removeNightGame` (qui devient, avec son nettoyage) :

```ts
export function removeNightGame(nightId: number, gameId: number, userId: number): NightGameResult {
  if (!isNightParticipant(nightId, userId)) return { error: 'Seuls les joueurs de la partie peuvent retirer des jeux', status: 403 };
  getDb().prepare('DELETE FROM night_games WHERE night_id = ? AND game_id = ?').run(nightId, gameId);
  // une boîte retirée emporte ses votes (v3.5) — pas de vote fantôme dans « Votés 👍 »
  getDb().prepare('DELETE FROM game_votes WHERE night_id = ? AND game_id = ?').run(nightId, gameId);
  // sa sélection a changé : sa validation saute (idiome v3.0.0, cf. addNightGame)
  getDb().prepare('UPDATE night_players SET validated_at = NULL WHERE night_id = ? AND user_id = ?').run(nightId, userId);
  notifyNight(nightId); // sync live : la boîte disparaît chez les autres joueurs
  return { ok: true };
}

// v3.5 — le vote sur l'étagère : bascule révocable, comme poser/retirer une boîte,
// mais SANS toucher à la validation (le vote n'est pas une boîte).
export function toggleNightVote(nightId: number, gameId: number, userId: number): NightGameResult {
  const db = getDb();
  const night = getNight(nightId);
  if (!night) return { error: 'Partie introuvable', status: 404 };
  if (!isNightParticipant(nightId, userId)) return { error: 'Seuls les joueurs de la partie peuvent voter', status: 403 };
  if (night.status === 'en_jeu') return { error: 'La partie a commencé — les votes sont figés', status: 409 };
  if (!isGameOnShelf(nightId, gameId)) return { error: "Ce jeu n'est pas sur l'étagère", status: 403 };
  if (db.prepare('SELECT 1 FROM game_votes WHERE night_id = ? AND game_id = ? AND user_id = ?').get(nightId, gameId, userId)) {
    db.prepare('DELETE FROM game_votes WHERE night_id = ? AND game_id = ? AND user_id = ?').run(nightId, gameId, userId);
  } else {
    db.prepare('INSERT OR IGNORE INTO game_votes (night_id, game_id, user_id) VALUES (?, ?, ?)').run(nightId, gameId, userId);
  }
  notifyNight(nightId); // sync live : le compteur bouge chez tout le monde
  return { ok: true };
}
```

Et après `getShelfGames` :

```ts
// v3.5 — les votes de la soirée (badge 👍, segmenté « Votés ») : qui a voté quoi.
export type ShelfVote = { game_id: number; user_id: number; pseudo: string };
export function getShelfVotes(nightId: number): ShelfVote[] {
  return getDb().prepare(`
    SELECT gv.game_id, gv.user_id, u.pseudo FROM game_votes gv
    JOIN users u ON u.id = gv.user_id
    WHERE gv.night_id = ? ORDER BY gv.created_at, gv.user_id`).all(nightId) as ShelfVote[];
}
```

- [ ] **Step 4: Vert** — `npx vitest run` → PASS (aucune régression, y compris `night-games.test.ts`).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(votes): bascule du vote + lecture des votés + nettoyage au retrait d une boîte"`

---

### Task 3: Route API `POST /api/nights/[id]/votes`

**Files:**
- Create: `app/api/nights/[id]/votes/route.ts`

**Interfaces:**
- Consumes: T2 (`toggleNightVote`), existants `getSessionUser`, `getNight`, `userCanAccessNight` (gabarit exact de `app/api/nights/[id]/games/route.ts`).
- Produces: `POST /api/nights/[id]/votes` corps `{ gameId }` → `{ ok: true }` ou `{ error }` 400/401/403/404/409.

- [ ] **Step 1: Implémenter** — create `app/api/nights/[id]/votes/route.ts` :

```ts
// POST { gameId } : bascule le 👍 du joueur connecté sur une boîte de l'étagère.
// Gabarit de la route games : gardes de session et d'accès, la logique vit dans lib/nights.
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getNight, userCanAccessNight, toggleNightVote } from '@/lib/nights';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const nightId = Number((await params).id);
  if (!Number.isInteger(nightId) || !getNight(nightId) || !userCanAccessNight(user.id, nightId))
    return NextResponse.json({ error: 'Soirée introuvable' }, { status: 404 });
  const { gameId } = await req.json();
  if (!Number.isInteger(gameId))
    return NextResponse.json({ error: 'Jeu invalide' }, { status: 400 });
  const res = toggleNightVote(nightId, gameId, user.id);
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Vérifier** — `npx tsc --noEmit` propre ; `npx vitest run` vert (la route est fine : logique déjà testée en T2, parcours HTTP en T4/T5).

- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat(votes): route API de bascule du vote"`

---

### Task 4: Le badge 👍 sur les boîtes

**Files:**
- Modify: `components/ShelfClient.tsx` (props + badge dans les boîtes)
- Modify: `app/etagere/page.tsx:34-36` (charger les votes, passer la prop)
- Modify: `app/globals.css` (bloc votes à la fin)
- Test: `tests/e2e/votes.spec.ts` (create)

**Interfaces:**
- Consumes: T2 (`getShelfVotes`, type `ShelfVote`), T3 (la route POST), existants `PlayerChip`, `BoxImage`, `OwnerBadge`, helpers E2E `tests/e2e/helpers/shelf.ts` (`newGame`, `putOnShelf`, `nightIdOf`).
- Produces: `ShelfClient` reçoit `votes: ShelfVote[]` ; badge `.vote-badge` (variante `.vote-moi`) rendu dans chaque boîte quand `!enJeu` ; tap → `POST /api/nights/[id]/votes` + `router.refresh()`.

- [ ] **Step 1: Test rouge** — create `tests/e2e/votes.spec.ts` :

```ts
import { test, expect, Page } from '@playwright/test';
import { newGame, putOnShelf } from './helpers/shelf';

// v3.5 — le vote s'incruste sur l'étagère : badge 👍 haut-droite de chaque boîte,
// cuivré quand c'est mon vote, révocable, partagé en direct. Le rituel ne change pas.

async function register(page: Page, pseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const reg = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await reg;
  await page.waitForURL('/etagere');
}

async function creerPartie(a: Page, pseudoInvite: string) {
  await a.reload(); // la liste des joueurs est rendue côté serveur
  await a.locator('.player-list label', { hasText: pseudoInvite }).locator('input').check();
  const nightDone = a.waitForResponse((r) => r.url().endsWith('/api/nights') && r.request().method() === 'POST');
  await a.getByRole('button', { name: 'Créer la partie' }).click();
  const { nightId } = await (await nightDone).json() as { nightId: number };
  return nightId;
}

async function creerPartieSolo(page: Page) {
  const nightDone = page.waitForResponse((r) => r.url().endsWith('/api/nights') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Créer la partie' }).click(); // créateur pré-coché
  const { nightId } = await (await nightDone).json() as { nightId: number };
  return nightId;
}

test('badge : visible à 0, tap = vote cuivré, re-tap retire, sans ouvrir la fiche', async ({ page }) => {
  await register(page, `vt-${Date.now().toString(36)}`);
  const nightId = await creerPartieSolo(page);
  const gid = await newGame(page, 'Cascadia', 'grand');
  await putOnShelf(page, gid, nightId);
  await page.goto('/etagere');

  const badge = page.locator('.box .vote-badge');
  await expect(badge).toContainText('0'); // visible même à zéro : l'invitation à voter
  await badge.click();
  await expect(badge).toContainText('1');
  await expect(badge).toHaveClass(/vote-moi/); // cuivré : MON vote
  await expect(page.locator('.sheet-backdrop')).toHaveCount(0); // pas de fiche ouverte
  // la boîte hors badge ouvre toujours la fiche
  await page.locator('.box').first().click();
  await expect(page.locator('.sheet-backdrop')).toBeVisible();
  await page.locator('.sheet-close').click();
  await expect(page.locator('.sheet-backdrop')).toHaveCount(0);

  await badge.click(); // re-tap : retiré
  await expect(badge).toContainText('0');
  await expect(badge).not.toHaveClass(/vote-moi/);
});

test('sync live : le vote de A monte le badge chez B sans rechargement', async ({ browser }) => {
  const s = Date.now().toString(36);
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  await register(a, `vt-a-${s}`);
  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await register(b, `vt-b-${s}`);
  const nightId = await creerPartie(a, `vt-b-${s}`);

  const gid = await newGame(a, 'Wingspan', 'grand');
  await putOnShelf(a, gid, nightId);
  await a.goto('/etagere');
  await expect(a.locator('body')).toHaveAttribute('data-sync', 'on', { timeout: 15_000 });
  await expect(b.locator('body')).toHaveAttribute('data-sync', 'on', { timeout: 15_000 });

  // A vote depuis son téléphone : le badge de B passe à 1 tout seul
  await a.locator('.box .vote-badge').click();
  await expect(b.locator('.box .vote-badge')).toContainText('1', { timeout: 5_000 });
  await expect(b.locator('.box .vote-badge')).not.toHaveClass(/vote-moi/); // pas LE vote de B
});
```

- [ ] **Step 2: Rouge** — `npx playwright test tests/e2e/votes.spec.ts` → FAIL (badge absent, aucune bascule).

- [ ] **Step 3: Page serveur** — `app/etagere/page.tsx` : importer `getShelfVotes` (ligne 3) et passer la prop (lignes 34-36) :

```tsx
import { getActiveNight, getNightPlayers, getShelfGames, getNightGame, getTodayTermineeNight, getShelfVotes } from '@/lib/nights';
```

```tsx
    <ShelfClient night={night} partyGame={getNightGame(night.id)} players={getNightPlayers(night.id)} games={getShelfGames(night.id)}
                 myLibrary={listUserLibrary(user.id)} users={users}
                 plays={getPickCounts()} votes={getShelfVotes(night.id)}
                 me={{ id: user.id, pseudo: user.pseudo, sticker: user.sticker, avatar_path: user.avatar_path }} />
```

- [ ] **Step 4: Le badge dans ShelfClient** — `components/ShelfClient.tsx` :

Entête (ajouter `ShelfVote` aux types importés de `@/lib/nights` — les types de lib passent par `@/lib/types` ici ; `ShelfVote` est exporté par `@/lib/nights`) :

```tsx
import type { Game, Night, UserLite } from '@/lib/types';
import type { ShelfVote } from '@/lib/nights';
```

Signature (ligne 22-25) :

```tsx
export default function ShelfClient({ night, partyGame, players, games, myLibrary, users, plays, votes, me }: {
  night: Night; partyGame: Game | null; players: UserLite[]; games: Game[]; myLibrary: Game[]; users: UserLite[]; plays: Record<number, number>;
  votes: ShelfVote[];
  me: UserLite;
}) {
```

Mémo des votes par jeu et des jeux votés (après le mémo `byFormat`, ligne 39 — ils ne dépendent que de `votes` et `games`) :

```tsx
  // v3.5 — votes de la soirée, vus par boîte : total, c'est MON vote, prénoms.
  const votesParJeu = useMemo(() => {
    const m = new Map<number, { total: number; votants: string[]; moi: boolean }>();
    for (const v of votes) {
      const e = m.get(v.game_id) ?? { total: 0, votants: [], moi: false };
      e.total += 1;
      e.votants.push(v.pseudo.split(' ')[0]);
      if (v.user_id === me.id) e.moi = true;
      m.set(v.game_id, e);
    }
    return m;
  }, [votes, me.id]);

  // v3.5 — les boîtes qui portent au moins un vote : le pool « Votés 👍 ».
  const jeuxVotes = useMemo(
    () => games.filter((g) => (votesParJeu.get(g.id)?.total ?? 0) > 0),
    [games, votesParJeu],
  );
```

La fonction voter (après `valider`, ligne 49-55) :

```tsx
  async function voter(gameId: number) {
    await fetch(`/api/nights/${night.id}/votes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId }),
    });
    router.refresh();
  }
```

Dans la boucle des boîtes (lignes 139-147, après `OwnerBadge`) — un `<span>`, jamais un bouton imbriqué :

```tsx
                {!enJeu && (() => {
                  const v = votesParJeu.get(g.id);
                  return (
                    <span className={'vote-badge' + (v?.moi ? ' vote-moi' : '')} role="button"
                          aria-pressed={v?.moi ?? false}
                          aria-label={`${v?.total ?? 0} vote${(v?.total ?? 0) > 1 ? 's' : ''} pour ${g.title}`}
                          title={v?.votants.length ? v.votants.slice(0, 4).join(' · ') + (v.votants.length > 4 ? ' …' : '') : undefined}
                          onClick={(e) => { e.stopPropagation(); voter(g.id); }}>
                      <span className="emoji" aria-hidden="true">👍</span>{v?.total ?? 0}
                    </span>
                  );
                })()}
```

- [ ] **Step 5: CSS** — append à `app/globals.css` :

```css
/* ===== v3.5 — vote sur l'étagère ===== */
.vote-badge {
  position: absolute; top: -7px; right: -5px; z-index: 3;
  display: flex; align-items: center; gap: 2px;
  border: 1.5px solid var(--doux); border-radius: 999px;
  background: var(--noyer); color: var(--doux-clair);
  font: inherit; font-size: 10.5px; font-weight: 800;
  padding: 3px 7px; cursor: pointer;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.55);
  transition: transform .12s ease;
  user-select: none;
}
.vote-badge:active { transform: scale(.9); }
.vote-badge.vote-moi { border-color: var(--cuivre); background: var(--cuivre); color: #fff; }
.vote-badge .emoji { font-size: 9.5px; }
```

- [ ] **Step 6: Vert** — `npx playwright test tests/e2e/votes.spec.ts` → PASS. Puis `npx vitest run` + `npx tsc --noEmit` propres.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat(votes): badge 👍 sur les boîtes — vote révocable partagé en direct"`

---

### Task 5: Le choix du pool au lancement (segmenté dans la CTA)

**Files:**
- Modify: `components/ShelfClient.tsx` (état `pool`, branche `jAiValide` du créateur, `lancer()`)
- Modify: `app/globals.css` (bloc `.choix-pool` à la fin)
- Test: `tests/e2e/votes.spec.ts` (append)

**Interfaces:**
- Consumes: T4 (`votesParJeu`, `voter`), existants `clicLancer`/`lancer` (navigation document).
- Produces: segmenté `.choix-pool` (« Tous les jeux · N » / « Votés 👍 · M ») à la place de la pill « ✓ Validée » quand ≥ 1 jeu voté ; `Lancer · M` ; `lancer()` envoie les ids du pool au clic.

- [ ] **Step 1: Test rouge** — append à `tests/e2e/votes.spec.ts` :

```ts
test('pool : segmenté seulement avec des votes, Votés → Lancer · M, tirage sur les votés', async ({ browser }) => {
  const s = Date.now().toString(36);
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  await register(a, `vp-a-${s}`);
  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await register(b, `vp-b-${s}`);
  const nightId = await creerPartie(a, `vp-b-${s}`);

  const g1 = await newGame(a, 'Cascadia', 'grand');
  const g2 = await newGame(a, 'Wingspan', 'moyen');
  await putOnShelf(a, g1, nightId);
  await putOnShelf(a, g2, nightId);
  await a.goto('/etagere');
  await expect(a.locator('body')).toHaveAttribute('data-sync', 'on', { timeout: 15_000 });
  await expect(b.locator('body')).toHaveAttribute('data-sync', 'on', { timeout: 15_000 });

  // A valide : sans vote, la rangée est exactement celle d'aujourd'hui (pill + Lancer · 2)
  await a.getByRole('button', { name: 'Valider ma sélection' }).click();
  await expect(a.locator('.pill-ok')).toContainText('✓ Validée');
  await expect(a.locator('.choix-pool')).toHaveCount(0);
  await expect(a.getByRole('button', { name: 'Lancer · 2' })).toBeVisible();

  // B vote pour Wingspan : chez A, le segmenté remplace la pill (live)
  await b.request.post(`/api/nights/${nightId}/votes`, { data: { gameId: g2 } });
  await expect(a.locator('.choix-pool')).toBeVisible({ timeout: 5_000 });
  await expect(a.locator('.choix-pool button.actif')).toContainText('Tous les jeux'); // défaut = tous
  await expect(a.getByRole('button', { name: 'Lancer · 2' })).toBeVisible();

  // « Votés 👍 » → le bouton compte les votés
  await a.locator('.choix-pool button', { hasText: 'Votés' }).click();
  await expect(a.getByRole('button', { name: 'Lancer · 1' })).toBeVisible();

  // B dé-vote : le segmenté disparaît, la pill revient, le lancer retombe sur tous
  await b.request.post(`/api/nights/${nightId}/votes`, { data: { gameId: g2 } });
  await expect(a.locator('.choix-pool')).toHaveCount(0, { timeout: 5_000 });
  await expect(a.locator('.pill-ok')).toContainText('✓ Validée');
  await expect(a.getByRole('button', { name: 'Lancer · 2' })).toBeVisible();

  // B revote les deux boîtes → A choisit « Votés » et lance : la roue reçoit les deux ids
  await b.request.post(`/api/nights/${nightId}/votes`, { data: { gameId: g1 } });
  await b.request.post(`/api/nights/${nightId}/votes`, { data: { gameId: g2 } });
  await expect(a.locator('.choix-pool')).toBeVisible({ timeout: 5_000 });
  await a.locator('.choix-pool button', { hasText: 'Votés' }).click();
  await expect(a.getByRole('button', { name: 'Lancer · 2' })).toBeVisible();
  const tirage = a.waitForURL(new RegExp(`/tirage/${nightId}\\?games=${g1},${g2}$`));
  await a.getByRole('button', { name: 'Lancer · 2' }).click();
  await tirage;
});

test('ajout tardif : la validation saute, le segmenté disparaît, le fantôme compte tous les jeux', async ({ browser }) => {
  const s = Date.now().toString(36);
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  await register(a, `vl-a-${s}`);
  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await register(b, `vl-b-${s}`);
  const nightId = await creerPartie(a, `vl-b-${s}`);

  const g1 = await newGame(a, 'Azul', 'grand');
  await putOnShelf(a, g1, nightId);
  await a.goto('/etagere');
  await expect(a.locator('body')).toHaveAttribute('data-sync', 'on', { timeout: 15_000 });
  await expect(b.locator('body')).toHaveAttribute('data-sync', 'on', { timeout: 15_000 });

  // B vote d'abord ; puis A valide → segmenté visible, choisit « Votés 👍 » → Lancer · 1
  await b.request.post(`/api/nights/${nightId}/votes`, { data: { gameId: g1 } });
  await a.getByRole('button', { name: 'Valider ma sélection' }).click();
  await expect(a.locator('.choix-pool')).toBeVisible({ timeout: 5_000 });
  await a.locator('.choix-pool button', { hasText: 'Votés' }).click();
  await expect(a.getByRole('button', { name: 'Lancer · 1' })).toBeVisible();

  // B ajoute une boîte : la validation de A saute (idiome) → branche « Valider ma
  // sélection », segmenté absent, et le Lancer fantôme compte TOUS les jeux (2) —
  // jamais l'ancien choix « Votés » (1)
  const g2 = await newGame(b, 'Tardif', 'petit');
  await putOnShelf(b, g2, nightId);
  await expect(a.getByRole('button', { name: 'Valider ma sélection' })).toBeVisible({ timeout: 5_000 });
  await expect(a.locator('.choix-pool')).toHaveCount(0);
  await expect(a.getByRole('button', { name: 'Lancer · 2' })).toBeVisible();
});

test('gelé en jeu : plus de badge vote une fois la boîte sortie', async ({ browser }) => {
  const s = Date.now().toString(36);
  const page = await browser.newContext().then((c) => c.newPage());
  await register(page, `vg-${s}`);
  const nightId = await creerPartieSolo(page);
  const gid = await newGame(page, '7 Wonders', 'moyen');
  await putOnShelf(page, gid, nightId);
  await page.goto('/etagere');
  await page.locator('.box').first().waitFor();

  await page.getByRole('button', { name: 'Valider ma sélection' }).click();
  await expect(page.locator('.pill-ok')).toContainText('✓ Validée');
  await page.getByRole('button', { name: 'Lancer · 1' }).click();
  await page.waitForURL(/\/tirage\//);

  // sortie de la boîte (l'étagère passe en_jeu) → retour étagère : plus aucun badge
  const out = await page.request.post(`/api/nights/${nightId}/box-out`, { data: { gameId: gid } });
  expect(out.ok()).toBeTruthy();
  await page.goto('/etagere');
  await expect(page.locator('.bandeau.v')).toContainText('est sortie de l');
  await expect(page.locator('.vote-badge')).toHaveCount(0);
});
```

- [ ] **Step 2: Rouge** — `npx playwright test tests/e2e/votes.spec.ts` → FAIL (pas de segmenté, le Lancer ne filtre pas, badges présents en jeu).

- [ ] **Step 3: Implémenter** — `components/ShelfClient.tsx` :

État du pool (avec les autres `useState`, ligne 27-31) :

```tsx
  const [pool, setPool] = useState<'tous' | 'votes'>('tous'); // choix du pool : état client, jamais stocké
```

Le pool effectif, juste **après** `const jAiValide = !!monEtat?.validated_at;` (ligne 44 — il en dépend) :

```tsx
  // hors branche du créateur validé, le pool vaut toujours « tous » (garde anti-état fantôme)
  const poolActif = jAiValide ? pool : 'tous';
```

`lancer()` (lignes 56-63) — recalcul complet au clic :

```tsx
  function lancer() {
    if (games.length === 0) return;
    // La liste du pool est recalculée ICI : une boîte votée retirée ou dé-votée
    // au même moment (sync live) ne peut pas glisser un id fantôme dans ?games=.
    const ids = poolActif === 'votes' && jeuxVotes.length > 0
      ? jeuxVotes.map((g) => g.id)
      : games.map((g) => g.id);
    // Navigation document (et non router.push) : le refresh du sync live qui
    // tombe au même moment pouvait annuler le push doux — on restait sur
    // l'étagère, bouton armé, sans erreur (flake CI v3.3). Le tirage est un
    // écran plein : le rechargement complet y est invisible et sans course.
    window.location.assign(`/tirage/${night.id}?games=${ids.join(',')}`);
  }
```

Branche `jAiValide` du créateur (lignes 164-183) — le segmenté remplace la pill, la pastille suit le pool :

```tsx
        ) : jAiValide ? (
          <>
            <div className="cta-row">
              {estCreateur && jeuxVotes.length > 0 ? (
                <div className="choix-pool" role="radiogroup" aria-label="Pool du tirage">
                  <button type="button" className={poolActif === 'tous' ? 'actif' : ''} onClick={() => setPool('tous')}>
                    Tous les jeux<span className="n">{games.length}</span>
                  </button>
                  <button type="button" className={poolActif === 'votes' ? 'actif' : ''} onClick={() => setPool('votes')}>
                    Votés 👍<span className="n">{jeuxVotes.length}</span>
                  </button>
                </div>
              ) : (
                <span className="pill-ok" aria-label="sélection validée">✓ Validée</span>
              )}
              {estCreateur && games.length > 0 ? (
                <button type="button" className={`btn-copper ${tousPrets ? 'pret' : ''}`} onClick={clicLancer}>
                  {surAffiche ? 'Sûr ? Lancer' : `Lancer · ${poolActif === 'votes' && jeuxVotes.length > 0 ? jeuxVotes.length : games.length}`}
                </button>
              ) : (
                !estCreateur && (
                  <span className="lance-par">Lancement par <b>{prenom(players.find((p) => p.id === night.creator_id) ?? me)}</b></span>
                )
              )}
            </div>
            {estCreateur && games.length > 0 && !tousPrets && (
              <p className="cta-statut">
                {players.length - enAttente.length}/{players.length} prêts — <b>{enAttente.map((p) => prenom(p)).join(', ')}</b> n&apos;a{enAttente.length > 1 ? 'ont' : ''} pas encore validé
              </p>
            )}
          </>
```

(Le bloc non-validé et le bloc `en_jeu` restent inchangés — le Lancer fantôme garde `Lancer · ${games.length}` via `poolActif = 'tous'`.)

- [ ] **Step 4: CSS** — append à `app/globals.css` :

```css
.choix-pool {
  display: grid; grid-template-columns: 1fr 1fr; gap: 3px;
  flex: 1.25; min-width: 0;
  background: var(--noyer);
  border: 1px solid color-mix(in srgb, var(--doux) 40%, transparent);
  border-radius: 13px; padding: 3px;
}
.choix-pool button {
  border: 0; background: none; color: var(--doux-clair);
  font: inherit; font-size: 12px; font-weight: 600;
  padding: 9px 4px; border-radius: 10px; cursor: pointer;
  transition: all .15s ease;
  white-space: nowrap;
}
.choix-pool button .n {
  display: inline-grid; place-items: center;
  background: color-mix(in srgb, var(--doux) 30%, transparent);
  border-radius: 999px; padding: 1px 7px; font-size: 10.5px; margin-left: 4px;
}
.choix-pool button.actif { background: var(--surface-plus); color: var(--creme); font-weight: 700; }
.choix-pool button.actif .n { background: var(--cuivre); color: #fff; }
```

- [ ] **Step 5: Vert** — `npx playwright test tests/e2e/votes.spec.ts` → PASS. Puis suites adjacentes (`tests/e2e/lancement.spec.ts`, `tests/e2e/validation.spec.ts`, `tests/e2e/etagere.spec.ts`) puis FULL `npx playwright test` + `npx vitest run` + `npx tsc --noEmit`.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(votes): choix du pool au lancement — Tous / Votés dans la CTA du créateur"`

---

### Task 6: Version 3.5.0 + CHANGELOG

**Files:**
- Modify: `package.json` (`"version": "3.5.0"`)
- Modify: `CHANGELOG.md` (entrée 3.5.0)

**Interfaces:**
- Consumes: T1-T5 (tout est en place).
- Produces: version `3.5.0` (affichage UserMenu, `sw.js` `wsp-v3.5.0` via `scripts/sync-sw-version.mjs` au build).

- [ ] **Step 1: CHANGELOG** — entrée en tête (après l'introduction) :

```markdown
## [3.5.0] — 2026-10-02

### Ajouté
- **Vote sur l'étagère 👍** : chacun touche le badge d'une boîte pour voter
  (badge cuivré = ton vote), re-toucher retire son vote. Compteurs partagés en
  direct, modifiables jusqu'au lancement — même après avoir validé sa sélection.
- **Choix du pool au lancement** : quand au moins un jeu a un vote, le créateur
  tire parmi « Tous les jeux · N » ou « Votés 👍 · N » (défaut : tous). La roue
  reçoit simplement une liste plus courte ; sans vote, le lancement est inchangé.
```

- [ ] **Step 2: Version + suites** — `package.json` → `"3.5.0"`. Puis TOUTES les suites de référence : `npx vitest run`, `npx playwright test`, `npx tsc --noEmit`, `npm run build` — tout vert avant de pousser.

- [ ] **Step 3: Commit** — `git add -A && git commit -m "chore: v3.5.0"`

- [ ] **Step 4: Release (contrôleur)** — push, PR, deux runs CI verts, merge, tag `v3.5.0` après CI main verte, release GitHub Latest, vérifier `curl -s https://etagere.marc-suarez.fr/sw.js | grep -o "wsp-v[0-9.]*"` = `wsp-v3.5.0`.
