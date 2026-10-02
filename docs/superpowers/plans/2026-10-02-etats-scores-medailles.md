# La vie d'une partie — états, carnet des scores, médailles (v3.3.0) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trois états de partie (création → en jeu à la sortie de la boîte → terminée), un carnet des scores, un historique avec podium et un profil à médailles — fini l'accumulation de jeux aux relances.

**Architecture:** `nights.status` + `nights.game_id` deviennent la vérité unique du cycle de vie ; `night_scores` stocke les scores (un appel `end` atomique). Les écrans lisent l'état : étagère (badge/bandeau), tirage (verdict provisoire → verrou), nouveau plein écran de scores, nouveau détail de soirée, profil enrichi. Sync live via `notifyNight` (fetch-reader, jamais EventSource).

**Tech Stack:** Next.js App Router + TypeScript, better-sqlite3, Vitest (unitaires), Playwright (E2E, workers 1).

**Spec:** `docs/superpowers/specs/2026-10-02-etats-scores-medailles-design.md` (à lire avec ce plan).

## Global Constraints

- UI 100 % français ; palette noyer `#2A1F17` / surface `#3A2B1F` / crème `#F3E9DC` / cuivre `#C96F3B` / vert `#3E9B6E` ; Bricolage Grotesque (titres) + Space Grotesque (data).
- Aucune nouvelle dépendance npm.
- Champs de saisie : `font-size: 16px` minimum (ruling zoom iOS v3.2).
- Sync live : pattern fetch-reader + marker `body[data-sync="on"]` ; EventSource interdit.
- E2E : `DATA_DIR` hors projet via `playwright.config.ts` (jamais `data/`) ; workers 1 ; ne jamais éditer de fichiers pendant une suite (Turbopack surveille la racine).
- TDD strict : test rouge observé, puis implémentation, puis vert. Commit à chaque étape verte.
- Avant release : `npx vitest run`, `npx playwright test`, `npx tsc --noEmit` tous verts ; deux runs CI verts avant merge ; tag après fusion.

## Review Focus

1. **Double sortie de boîte** (deux joueurs tapent quasi simultanément) : le second reçoit 409 et l'UI se verrouille — rien ne corrompt. Testé unitairement (T3) + E2E (T5).
2. **Scores invalides** (texte, score infini, joueur hors soirée) : le POST `end` rejette 400 ET la partie reste `en_jeu` (rien n'est semi-enregistré). Testé unitairement (T3) + E2E (T7).
3. **Soirée ancienne migrée sans scores** : le détail affiche « pas de scores », l'historique affiche la carte sans gagnant, aucun crash. Testé unitairement (T1/T3) + E2E (T8).
4. **Rechargement du tirage alors que la boîte est sortie** : état verrouillé direct, pas de nouvelle roue, pas de nouveau tirage. Testé par E2E (T5).
5. **Égalité de scores** : rangs denses, même médaille pour les ex æquo (1,1,2 — jamais 1,1,3). Testé unitairement (T2) + carnet en direct (T7).

---

### Task 1: Migration — `nights.status`, `nights.game_id`, table `night_scores`

**Files:**
- Modify: `lib/db.ts` (bloc migrations dans `getDb()`, ~ligne 85)
- Modify: `lib/types.ts:14` (interface `Night`)
- Test: `tests/unit/db.test.ts`

**Interfaces:**
- Produces: colonnes `nights.status` (`'creation' | 'en_jeu' | 'termine'`, défaut `'creation'`) et `nights.game_id INTEGER` ; table `night_scores(night_id, user_id, score REAL, UNIQUE(night_id,user_id))` ; `Night` TypeScript enrichi — tous les `SELECT n.*` les renvoient déjà.
- Produces: `runMigrations(db)` exporté et testable (extrait du bloc inline actuel).

- [ ] **Step 1: Écrire le test rouge** — ajouter à `tests/unit/db.test.ts` :

```ts
it('expose le cycle de vie v3.3 : nights.status, nights.game_id, night_scores', () => {
  const db = getDb();
  const cols = (db.prepare('PRAGMA table_info(nights)').all() as { name: string }[]).map((c) => c.name);
  for (const c of ['status', 'game_id']) expect(cols).toContain(c);
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map((r: { name: string }) => r.name);
  expect(tables).toContain('night_scores');
  // défaut : création
  const n = db.prepare(`INSERT INTO nights (creator_id) VALUES ((SELECT id FROM users LIMIT 1))`).run();
  expect((db.prepare('SELECT status FROM nights WHERE id = ?').get(n.lastInsertRowid) as { status: string }).status).toBe('creation');
});

it('migre les soirées archivées (ended_at posé, pré-v3.3) en « termine »', () => {
  const db = getDb();
  const u = db.prepare(`INSERT INTO users (pseudo, code_hash) VALUES ('n-mig', 'x')`).run();
  const n = db.prepare(`INSERT INTO nights (creator_id, ended_at, status) VALUES (?, datetime('now','localtime'), 'creation')`).run(u.lastInsertRowid);
  runMigrations(db); // idempotent : rejouable à chaud
  expect((db.prepare('SELECT status FROM nights WHERE id = ?').get(n.lastInsertRowid) as { status: string }).status).toBe('termine');
});
```

Import en tête : `import { getDb, runMigrations } from '@/lib/db';`

- [ ] **Step 2: Vérifier le rouge** — `npx vitest run tests/unit/db.test.ts` → FAIL (« status » absent, `runMigrations` non exporté).

- [ ] **Step 3: Implémenter** — dans `lib/db.ts`, ajouter la table au `SCHEMA` (après `night_games`) :

```sql
CREATE TABLE IF NOT EXISTS night_scores (
  night_id INTEGER NOT NULL REFERENCES nights(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score REAL,
  UNIQUE(night_id, user_id)
);
```

Extraire et enrichir les migrations :

```ts
// Migrations incrémentales v1 : ALTER idempotent (« duplicate column » = déjà en place).
export function runMigrations(db: Database.Database): void {
  for (const stmt of [
    'ALTER TABLE games ADD COLUMN designer TEXT',
    'ALTER TABLE games ADD COLUMN artist TEXT',
    'ALTER TABLE games ADD COLUMN best_players INTEGER',
    'ALTER TABLE nights ADD COLUMN start_time TEXT',
    'ALTER TABLE nights ADD COLUMN ended_at TEXT',
    'ALTER TABLE users ADD COLUMN sticker TEXT',
    'ALTER TABLE users ADD COLUMN avatar_path TEXT',
    'ALTER TABLE users ADD COLUMN foyer_id INTEGER REFERENCES foyers(id)',
    'ALTER TABLE games ADD COLUMN foyer_id INTEGER REFERENCES foyers(id)',
    'ALTER TABLE night_players ADD COLUMN validated_at TEXT',
    "ALTER TABLE nights ADD COLUMN status TEXT NOT NULL DEFAULT 'creation'",
    'ALTER TABLE nights ADD COLUMN game_id INTEGER REFERENCES games(id)',
  ]) {
    try { db.exec(stmt); } catch { /* colonne déjà présente */ }
  }
  // v3.3 : les soirées archivées avant l'existence des états deviennent « termine ».
  db.prepare(`UPDATE nights SET status = 'termine' WHERE ended_at IS NOT NULL AND status = 'creation'`).run();
}
```

`getDb()` appelle `runMigrations(db)` à la place du bloc inline.

Dans `lib/types.ts:14` : `export interface Night { id: number; creator_id: number; played_at: string; start_time?: string | null; ended_at?: string | null; status: 'creation' | 'en_jeu' | 'termine'; game_id?: number | null; created_at: string; }`

- [ ] **Step 4: Vert** — `npx vitest run tests/unit/db.test.ts` → PASS. Puis `npx vitest run` (aucune régression).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(db): nights.status + nights.game_id + night_scores (migration v3.3)"`

---

### Task 2: `rankScores` — classement dense et médailles

**Files:**
- Create: `lib/ranks.ts`
- Test: `tests/unit/ranks.test.ts`

**Interfaces:**
- Produces: `rankScores<T extends { score: number | null }>(rows: T[]): (T & { rank: number })[]` (exclut les scores null/non finis, tri desc, rangs denses) ; `MEDAILLES: readonly ['👑','🥈','🥉']` ; `medaille(rank: number): string` (`''` au-delà de 3).
- Consumed by: T3 (requêtes), T7 (carnet live), T8 (podium), T9 (profil).

- [ ] **Step 1: Test rouge** — `tests/unit/ranks.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { rankScores, medaille } from '@/lib/ranks';

describe('rankScores', () => {
  it('trie descendant et numérote', () => {
    const r = rankScores([{ id: 1, score: 10 }, { id: 2, score: 30 }, { id: 3, score: 20 }]);
    expect(r.map((x) => x.id)).toEqual([2, 3, 1]);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 3]);
  });
  it('égalité : même rang, rang dense (1,1,2 — jamais 1,1,3)', () => {
    const r = rankScores([{ id: 1, score: 19 }, { id: 2, score: 24 }, { id: 3, score: 19 }]);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 2]);
  });
  it('exclut les scores absents ou non finis', () => {
    const r = rankScores([{ id: 1, score: null }, { id: 2, score: Number.NaN }, { id: 3, score: 5 }]);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe(3);
  });
  it('vide → vide ; medaille au-delà de 3 → chaîne vide', () => {
    expect(rankScores([])).toEqual([]);
    expect(medaille(0)).toBe('');
    expect(medaille(4)).toBe('');
  });
});
```

- [ ] **Step 2: Rouge** — `npx vitest run tests/unit/ranks.test.ts` → FAIL (module absent).

- [ ] **Step 3: Implémentation** — `lib/ranks.ts` :

```ts
// Classement dense : l'égalité partage la médaille, le rang suivant ne saute pas (1,1,2).
// Un joueur sans score (null / non fini) n'existe pas dans le classement.
export function rankScores<T extends { score: number | null }>(rows: T[]): (T & { rank: number })[] {
  const tries = rows
    .filter((r): r is T & { score: number } => r.score != null && Number.isFinite(r.score))
    .sort((a, b) => b.score - a.score);
  let dernier = Number.NaN;
  let rang = 0;
  return tries.map((r) => {
    if (r.score !== dernier) { rang += 1; dernier = r.score; }
    return { ...r, rank: rang };
  });
}

export const MEDAILLES = ['👑', '🥈', '🥉'] as const;
export const medaille = (rank: number): string => MEDAILLES[rank - 1] ?? '';
```

- [ ] **Step 4: Vert** — `npx vitest run tests/unit/ranks.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: rankScores — classement dense + médailles (lib pure)"`

---

### Task 3: Machine d'état — `boxOutNight`, `endNight` (scores), garde du tirage, lectures

**Files:**
- Modify: `lib/nights.ts` (remplacer `endNight` ligne 15-17 ; ajouter les fonctions après `getMyNights` ligne 86)
- Modify: `lib/nights.ts` `getActiveNight` (ligne 5-13 : `ended_at IS NULL` → `status != 'termine'`)
- Create: `tests/unit/etats.test.ts`

**Interfaces:**
- Consumes: T1 (colonnes), T2 (`rankScores`).
- Produces (signatures exactes pour T4-T9) :
  - `boxOutNight(nightId: number, userId: number, gameId: number): { ok: true } | NightStateError`
  - `endNight(nightId: number, userId: number, scores?: Record<string, number>): { ok: true } | NightStateError`
  - `drawAllowed(nightId: number): { ok: true } | NightStateError`
  - `getNightGame(nightId: number): Game | null`
  - `getNightScores(nightId: number): NightScoreRow[]` où `NightScoreRow = { user_id: number; pseudo: string; sticker: string | null; avatar_path: string | null; score: number | null }`
  - `getHistoryCards(userId: number): NightCard[]` où `NightCard = Night & { game_title: string | null; game_cover_path: string | null; game_cover_url: string | null; gagnant_pseudo: string | null; gagnant_score: number | null }`
  - `export type NightStateError = { error: string; status: number }` (remplace le usage ad hoc `NightGameResult`)
  - `getTodayTermineeNight(userId: number): (Night & { game_title: string | null }) | null`

- [ ] **Step 1: Test rouge** — `tests/unit/etats.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { registerUser } from '@/lib/auth';
import { createGame } from '@/lib/games';
import { createNight, boxOutNight, endNight, drawAllowed, getNight, getNightScores, getHistoryCards, getTodayTermineeNight, addNightGame, getActiveNight } from '@/lib/nights';
import { getDb } from '@/lib/db';

const uid = (p: string) => (registerUser(p, '1234') as { id: number }).id;

describe('états de partie', () => {
  it('sortir la boîte : création → en_jeu, jeu verrouillé, tirage refusé ensuite', () => {
    const marc = uid('e-marc'); const lea = uid('e-lea');
    const g = createGame(marc, { title: 'Cascadia', box_format: 'moyen' });
    const n = createNight(marc, [marc, lea]);
    addNightGame(n, g, marc);
    expect(drawAllowed(n)).toEqual({ ok: true });
    expect(boxOutNight(n, lea, g.id)).toEqual({ ok: true }); // un INVITÉ peut sortir la boîte
    const night = getNight(n)!;
    expect(night.status).toBe('en_jeu');
    expect(night.game_id).toBe(g.id);
    expect(drawAllowed(n)).toEqual({ error: 'La boîte est sortie — le jeu est verrouillé', status: 409 });
    expect(boxOutNight(n, marc, g.id)).toEqual({ error: 'La boîte est déjà sortie', status: 409 });
  });
  it('refuse une boîte hors étagère, un hors-la-soirée, et le tirage sur une partie terminée', () => {
    const marc = uid('e-m2'); const lea = uid('e-l2'); const zoe = uid('e-z2');
    const g = createGame(marc, { title: 'Azul', box_format: 'petit' });
    const n = createNight(marc, [marc, lea]);
    expect(boxOutNight(n, marc, g.id)).toEqual({ error: "Ce jeu n'est pas sur l'étagère", status: 400 });
    expect(boxOutNight(n, zoe, g.id).status).toBe(403);
    addNightGame(n, g, marc);
    endNight(n, marc);
    expect(boxOutNight(n, marc, g.id)).toEqual({ error: 'Cette partie est terminée', status: 409 });
  });
  it('terminer : créateur seulement, scores atomiques, double end refusé', () => {
    const marc = uid('e-m3'); const lea = uid('e-l3'); const zoe = uid('e-z3');
    const n = createNight(marc, [marc, lea]);
    expect(endNight(n, lea).status).toBe(403); // pas le créateur
    expect(endNight(n, marc, { [marc]: 24, [lea]: 19 })).toEqual({ ok: true });
    expect(endNight(n, marc).status).toBe(409); // double end
    expect(getNightScores(n).map((r) => r.score)).toEqual([24, 19]);
  });
  it('scores invalides : rejet 400 ET la partie reste en_jeu (rien de semi-enregistré)', () => {
    const marc = uid('e-m4'); const lea = uid('e-l4');
    const g = createGame(marc, { title: 'Harmonies', box_format: 'petit' });
    const n = createNight(marc, [marc, lea]);
    addNightGame(n, g, marc);
    boxOutNight(n, marc, g.id);
    expect(endNight(n, marc, { [marc]: Number.NaN }).status).toBe(400);
    expect(endNight(n, marc, { [zoe]: 5 }).status).toBe(400); // zoe ne joue pas — zoe = personne : utiliser un id hors soirée
    expect(getNight(n)!.status).toBe('en_jeu');
    expect(getNightScores(n)).toHaveLength(0);
  });
  it('terminer sans scores = aucune ligne ; depuis creation = abandon', () => {
    const marc = uid('e-m5'); const lea = uid('e-l5');
    const n = createNight(marc, [marc, lea]);
    endNight(n, marc); // abandon depuis creation
    expect(getNight(n)!.status).toBe('termine');
    expect(getNightScores(n)).toHaveLength(0);
  });
  it('lectures : getNightGame, historique avec gagnant, soirée du jour terminée, active exclut termine', () => {
    const marc = uid('e-m6'); const lea = uid('e-l6');
    const g = createGame(marc, { title: 'Terraforming Mars', box_format: 'grand' });
    const n = createNight(marc, [marc, lea]);
    addNightGame(n, g, marc);
    boxOutNight(n, marc, g.id);
    endNight(n, marc, { [marc]: 81, [lea]: 88 });
    expect(getNightGame(n)!.title).toBe('Terraforming Mars');
    const card = getHistoryCards(marc).find((c) => c.id === n)!;
    expect(card.gagnant_pseudo).toBe('e-l6');
    expect(card.gagnant_score).toBe(88);
    expect(card.game_title).toBe('Terraforming Mars');
    expect(getActiveNight(marc)).toBeNull(); // terminée → plus active
    const duJour = getTodayTermineeNight(marc);
    expect(duJour?.id).toBe(n);
    expect(duJour?.game_title).toBe('Terraforming Mars');
  });
  it('historique : carte sans scores ni gagnant (soirée migrée)', () => {
    const marc = uid('e-m7');
    const n = createNight(marc, [marc]);
    getDb().prepare(`UPDATE nights SET played_at = date('now','-1 day'), status='termine', ended_at=datetime('now','localtime') WHERE id=?`).run(n);
    const card = getHistoryCards(marc).find((c) => c.id === n)!;
    expect(card.gagnant_pseudo).toBeNull();
    expect(card.game_title).toBeNull();
  });
});
```

(Note : dans le 4ᵉ test, remplacer `{ [zoe]: 5 }` par un id inexistant, ex. `{ [999999]: 5 }` — zoe n'est pas déclarée ici.)

- [ ] **Step 2: Rouge** — `npx vitest run tests/unit/etats.test.ts` → FAIL (fonctions absentes).

- [ ] **Step 3: Implémentation** — dans `lib/nights.ts` :

```ts
export type NightStateError = { error: string; status: number };

// La boîte sort : LE vrai début de la partie. N'importe quel joueur de la soirée
// peut la sortir (c'est physique : celui qui va chercher la boîte). Le jeu est
// alors verrouillé — plus de relance, plus d'ajout/retrait sur l'étagère.
export function boxOutNight(nightId: number, userId: number, gameId: number): { ok: true } | NightStateError {
  const night = getNight(nightId);
  if (!night) return { error: 'Soirée introuvable', status: 404 };
  if (!userCanAccessNight(userId, nightId)) return { error: 'Seuls les joueurs de la soirée peuvent sortir la boîte', status: 403 };
  if (night.status === 'en_jeu') return { error: 'La boîte est déjà sortie', status: 409 };
  if (night.status === 'termine') return { error: 'Cette partie est terminée', status: 409 };
  if (!getShelfGames(nightId).some((g) => g.id === gameId)) return { error: "Ce jeu n'est pas sur l'étagère", status: 400 };
  getDb().prepare(`UPDATE nights SET game_id = ?, status = 'en_jeu' WHERE id = ?`).run(gameId, nightId);
  notifyNight(nightId);
  return { ok: true };
}

// Le tirage n'existe qu'avant la sortie de boîte.
export function drawAllowed(nightId: number): { ok: true } | NightStateError {
  const night = getNight(nightId);
  if (!night) return { error: 'Soirée introuvable', status: 404 };
  if (night.status === 'en_jeu') return { error: 'La boîte est sortie — le jeu est verrouillé', status: 409 };
  if (night.status === 'termine') return { error: 'Cette partie est terminée', status: 409 };
  return { ok: true };
}

// Terminer : créateur seulement. Scores optionnels { [userId]: nombre } — un seul
// appel atomique (insertion + état) : rien ne se semi-enregistre. Depuis
// creation = abandon (sans scores). Double end refusé.
export function endNight(nightId: number, userId: number, scores?: Record<string, number>): { ok: true } | NightStateError {
  const night = getNight(nightId);
  if (!night) return { error: 'Soirée introuvable', status: 404 };
  if (night.creator_id !== userId) return { error: 'Seul le créateur peut terminer la soirée', status: 403 };
  if (night.status === 'termine') return { error: 'La partie est déjà terminée', status: 409 };
  const db = getDb();
  const joueurs = new Set((db.prepare('SELECT user_id FROM night_players WHERE night_id = ?').all(nightId) as { user_id: number }[]).map((r) => r.user_id));
  const lignes: [number, number][] = [];
  if (scores) {
    for (const [k, v] of Object.entries(scores)) {
      const uid = Number(k);
      if (!joueurs.has(uid) || !Number.isFinite(v)) return { error: 'Score invalide', status: 400 };
      lignes.push([uid, v]);
    }
  }
  db.transaction(() => {
    const ins = db.prepare('INSERT OR REPLACE INTO night_scores (night_id, user_id, score) VALUES (?, ?, ?)');
    for (const [uid, v] of lignes) ins.run(nightId, uid, v);
    db.prepare(`UPDATE nights SET status = 'termine', ended_at = datetime('now','localtime') WHERE id = ?`).run(nightId);
  })();
  notifyNight(nightId);
  return { ok: true };
}

// LA boîte de la partie (une seule, jamais la liste des relances).
export function getNightGame(nightId: number): Game | null {
  const night = getNight(nightId);
  if (!night?.game_id) return null;
  return (getDb().prepare('SELECT * FROM games WHERE id = ?').get(night.game_id) as Game | undefined) ?? null;
}
export type NightScoreRow = { user_id: number; pseudo: string; sticker: string | null; avatar_path: string | null; score: number | null };
export function getNightScores(nightId: number): NightScoreRow[] {
  return getDb().prepare(`
    SELECT ns.user_id, u.pseudo, u.sticker, u.avatar_path, ns.score
    FROM night_scores ns JOIN users u ON u.id = ns.user_id
    WHERE ns.night_id = ?`).all(nightId) as NightScoreRow[];
}
export type NightCard = Night & { game_title: string | null; game_cover_path: string | null; game_cover_url: string | null; gagnant_pseudo: string | null; gagnant_score: number | null };
export function getHistoryCards(userId: number): NightCard[] {
  return getDb().prepare(`
    SELECT n.*, g.title AS game_title, g.cover_path AS game_cover_path, g.cover_url AS game_cover_url,
      (SELECT u.pseudo FROM night_scores ns JOIN users u ON u.id = ns.user_id
        WHERE ns.night_id = n.id AND ns.score IS NOT NULL ORDER BY ns.score DESC, u.pseudo LIMIT 1) AS gagnant_pseudo,
      (SELECT ns.score FROM night_scores ns WHERE ns.night_id = n.id AND ns.score IS NOT NULL ORDER BY ns.score DESC LIMIT 1) AS gagnant_score
    FROM nights n LEFT JOIN games g ON g.id = n.game_id
    WHERE n.status = 'termine' AND (n.creator_id = ? OR EXISTS (SELECT 1 FROM night_players np WHERE np.night_id = n.id AND np.user_id = ?))
    ORDER BY n.played_at DESC, n.id DESC`).all(userId, userId) as NightCard[];
}
export function getTodayTermineeNight(userId: number): (Night & { game_title: string | null }) | null {
  return (getDb().prepare(`
    SELECT n.*, g.title AS game_title FROM nights n LEFT JOIN games g ON g.id = n.game_id
    WHERE n.played_at = date('now','localtime') AND n.status = 'termine'
      AND (n.creator_id = ? OR EXISTS (SELECT 1 FROM night_players np WHERE np.night_id = n.id AND np.user_id = ?))
    ORDER BY n.id DESC LIMIT 1`).get(userId, userId) as (Night & { game_title: string | null }) | undefined) ?? null;
}
```

`getActiveNight` : remplacer `AND n.ended_at IS NULL` par `AND n.status != 'termine'`. Ajouter `Game` aux imports de types. `endNight` remplace l'ancienne signature (la route T4 s'adapte). `notifyNight` reste privé (déjà dans ce fichier).

- [ ] **Step 4: Vert** — `npx vitest run tests/unit/etats.test.ts` → PASS. Puis `npx vitest run` (le test existant qui appelait l'ancien `endNight(n)` — s'il existe — sera adapté au passage : chercher `endNight(` dans `tests/`).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: machine d'états — boxOut/end(scores)/drawAllowed + lectures v3.3"`

---

### Task 4: Routes API — garde du draw, box-out, end(scores)

**Files:**
- Modify: `app/api/draw/route.ts` (garde après le check d'accès)
- Create: `app/api/nights/[id]/box-out/route.ts`
- Modify: `app/api/nights/[id]/end/route.ts` (rewrite)

**Interfaces:**
- Consumes: T3 (`drawAllowed`, `boxOutNight`, `endNight` — unions `{ ok: true } | NightStateError`).
- Produces: `POST /api/nights/[id]/box-out` `{ gameId }` → `{ ok: true }` ou `{ error }` (400/403/404/409) ; `POST /api/nights/[id]/end` corps optionnel `{ scores?: { [userId: string]: number } }` ; `POST /api/draw` → 409 hors `creation`.

- [ ] **Step 1: Implémenter** (routes fines ; la logique est déjà testée en T3, les parcours HTTP sont couverts par les E2E T5-T8) — `app/api/draw/route.ts`, après le check `userCanAccessNight` :

```ts
import { drawAllowed } from '@/lib/nights';
// …
  const gate = drawAllowed(night.id);
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
```

`app/api/nights/[id]/box-out/route.ts` :

```ts
// POST : la boîte sort — la partie démarre (n'importe quel joueur de la soirée).
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { boxOutNight } from '@/lib/nights';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const { gameId } = await req.json();
  const res = boxOutNight(Number((await params).id), user.id, Number(gameId));
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}
```

`app/api/nights/[id]/end/route.ts` (rewrite) :

```ts
// POST : terminer la soirée (créateur seulement). Corps optionnel { scores } :
// le carnet des scores enregistre et termine en un seul appel atomique.
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getNight, endNight } from '@/lib/nights';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const night = getNight(Number((await params).id));
  if (!night) return NextResponse.json({ error: 'Soirée introuvable' }, { status: 404 });
  let scores: Record<string, number> | undefined;
  try {
    const body = await req.json();
    if (body && typeof body === 'object' && body.scores && typeof body.scores === 'object') scores = body.scores;
  } catch { /* sans corps : abandon d'une soirée en préparation */ }
  const res = endNight(night.id, user.id, scores);
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Vert + tsc** — `npx tsc --noEmit` propre ; `npx vitest run` vert.

- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat(api): box-out + end(scores) + garde du draw"`

---

### Task 5: Tirage — verdict provisoire, verrou après la boîte

**Files:**
- Modify: `app/tirage/[nightId]/page.tsx` (passer `status`, `partyGame`)
- Modify: `components/TirageClient.tsx`
- Modify: `tests/e2e/tirage.spec.ts` (le test existant affirme « Relancer » APRÈS la boîte — à inverser, rouge d'abord)

**Interfaces:**
- Consumes: T4 (`POST box-out`, draw 409).
- Produces: `TirageClient({ nightId, games, waitingPseudos, startTime, status, partyGame })` — `status: Night['status']`, `partyGame: Game | null` (LA boîte si `en_jeu`). Phases : `spin | verdict | enjeu | error`.

- [ ] **Step 1: Adapter le test existant en rouge** — dans `tests/e2e/tirage.spec.ts`, remplacer la fin du test (après « LA ROUE A PARLÉ ») :

```ts
  await expect(page.getByRole('button', { name: 'Sortir la boîte 📦' })).toBeVisible();
  await expect(page.locator('.pastille.prov')).toContainText('jeu pressenti');
  // Relancer AVANT la boîte : le verdict se remplace, rien ne s'accumule
  await page.getByRole('button', { name: '↻ Relancer le tirage' }).click();
  await expect(page.getByText('LA ROUE A PARLÉ')).toBeVisible({ timeout: 10_000 });
  // Sortir la boîte : la partie démarre, tout se verrouille
  await page.getByRole('button', { name: 'Sortir la boîte 📦' }).click();
  await expect(page.locator('.pastille.ok')).toContainText('jeu de la partie');
  await expect(page.getByRole('button', { name: 'Relancer le tirage' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '🏁 Partie terminée' })).toBeVisible();
  await expect(page.locator('.verrou-note')).toContainText('jeu verrouillé');
```

- [ ] **Step 2: Rouge** — `npx playwright test tests/e2e/tirage.spec.ts` → FAIL (pas de `.pastille`, « Relancer » encore visible après la boîte).

- [ ] **Step 3: Implémenter** — page serveur, après `selected.length === 0` check :

```ts
import { getNightGame } from '@/lib/nights';
// …
  return <TirageClient nightId={night.id} games={selected} waitingPseudos={waitingPseudos}
                       startTime={night.start_time ?? null} status={night.status}
                       partyGame={getNightGame(night.id)} />;
```

`TirageClient.tsx` :

```tsx
export default function TirageClient({ nightId, games, waitingPseudos, startTime, status, partyGame }: {
  nightId: number; games: Game[]; waitingPseudos: string[]; startTime: string | null;
  status: Night['status']; partyGame: Game | null;
}) {
  type Phase = 'spin' | 'verdict' | 'enjeu' | 'error';
  const [phase, setPhase] = useState<Phase>(status === 'en_jeu' && partyGame ? 'enjeu' : 'spin');
  // … état existant (picked, rotation, error, timer, started) …
  const router = useRouter();

  // Pas de nouveau tirage si la boîte est déjà sortie (rechargement, autre joueur).
  useEffect(() => {
    if (started.current || status !== 'creation') return;
    started.current = true;
    draw();
  }, [draw, status]);

  // Sync live : un AUTRE joueur sort la boîte pendant que je suis sur le verdict —
  // le refresh serveur fait passer status à 'en_jeu', l'écran se verrouille ici aussi.
  useEffect(() => {
    if (status === 'en_jeu' && partyGame) setPhase('enjeu');
  }, [status, partyGame]);

  async function sortirBoite() {
    if (!picked) return;
    const res = await fetch(`/api/nights/${nightId}/box-out`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: picked.id }),
    });
    if (!res.ok) { setError((await res.json()).error ?? 'Impossible'); setPhase('error'); return; }
    setPhase('enjeu');
    navigator.vibrate?.([60, 40, 60]);
    router.refresh(); // les autres téléphones basculent via le sync live
  }
```

Rendu : le verdict garde sa structure ; pastille avant les actions :
`<div className="pastille prov">jeu pressenti — remplaçable</div>` ; bouton boîte → `onClick={sortirBoite}` ; « Relancer » seulement en phase `verdict`. Nouvelle phase `enjeu` :

```tsx
  {phase === 'enjeu' && partyGame && (
    <section className="verdict locked" aria-live="polite">
      <p className="verdict-kicker">LA PARTIE EST LANCÉE</p>
      <div className="pastille ok">jeu de la partie ✓</div>
      <div className="verdict-spot">…cover de partyGame…</div>
      <h1 className="verdict-title">{partyGame.title}</h1>
      <div className="chips">…chips de partyGame (mêmes helpers)…</div>
      <div className="verdict-actions">
        <a className="btn-copper" href={`/nights/${nightId}/scores`}>🏁 Partie terminée</a>
        <button type="button" className="btn-ghost" onClick={() => shareMessage(buildResultMessage({ title: partyGame.title, ownerPseudo: partyGame.owner_pseudo ?? '', waiting: waitingPseudos.filter((p) => p !== partyGame.owner_pseudo), time: startTime }))}>💬 Annoncer sur WhatsApp</button>
      </div>
      <p className="verrou-note">🔒 jeu verrouillé — la relance n&apos;existe plus</p>
    </section>
  )}
```

La roue se voile en `enjeu` : `<div className={'tirage-stage' + (phase === 'enjeu' ? ' voilee' : '')}>`.

- [ ] **Step 4: CSS** — `app/globals.css`, bloc après les styles verdict :

```css
/* v3.3 — verdict provisoire puis verrou : la boîte sortie démarre la partie */
.pastille { display: inline-flex; align-items: center; gap: 6px; margin-top: 8px; border-radius: 999px; padding: 4px 11px; font-size: 11.5px; font-weight: 600; }
.pastille.prov { border: 1px dashed var(--cuivre); color: var(--cuivre); }
.pastille.ok { background: color-mix(in srgb, var(--vert) 16%, transparent); color: var(--vert); border: 1px solid color-mix(in srgb, var(--vert) 45%, transparent); }
.tirage-stage.voilee .wheel { filter: grayscale(.5) brightness(.55); }
.verrou-note { display: flex; align-items: center; justify-content: center; gap: 7px; font-size: 12px; color: var(--doux-clair); margin-top: 10px; }
```

- [ ] **Step 5: Vert** — `npx playwright test tests/e2e/tirage.spec.ts` → PASS. Puis `npx playwright test` complet (les suites lancement/validation ne doivent pas casser).

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(tirage): jeu pressenti remplaçable puis verrou à la sortie de boîte"`

---

### Task 6: Étagère — badge d'état, bandeau « en jeu », carte « terminée »

**Files:**
- Modify: `components/ShelfClient.tsx` (badge, mode en_jeu, CTA terminée)
- Modify: `app/etagere/page.tsx` (passer `partyGame` ; carte terminée + NightPicker)
- Create: `components/TermineeCard.tsx`
- Modify: `app/globals.css` (badge + bandeau, bloc après `.night-card .etats`)
- Test: `tests/e2e/etats-scores.spec.ts` (créé — premiers tests ici)

**Interfaces:**
- Consumes: T3 (`getNightGame`, `getTodayTermineeNight`), T5 (le verrou se produit au tirage).
- Produces: `ShelfClient({ night, partyGame, … })` — `partyGame: Game | null` ; `TermineeCard({ nightId, gameTitle, coverPath, coverUrl })` ; helper E2E `registerAndStart(page, pseudo)` (1 joueur), réutilisé par T7/T8/T9.

- [ ] **Step 1: Test rouge** — `tests/e2e/etats-scores.spec.ts` (helper local complet, réutilisé par T7/T8/T9 ; **pseudos ≤ 20 caractères**, ruling v3.2) :

```ts
import { test, expect, Page } from '@playwright/test';
import { newGame, gameIdByTitle, nightIdOf, putOnShelf } from './helpers/shelf';

async function registerAndStart(page: Page, pseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const reg = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await reg;
  await page.getByRole('button', { name: 'Créer la partie' }).click();
}

test('étagère : badge En préparation, puis bandeau en jeu après la boîte', async ({ page }) => {
  await registerAndStart(page, `eta-${Date.now()}`);
  const g = await newGame(page, 'Cascadia', 'moyen');
  await putOnShelf(page, g);
  await page.goto('/etagere');
  await expect(page.locator('.badge-etat')).toContainText('En préparation');
  // valider puis lancer + sortir la boîte (flux tirage via API pour aller vite)
  await page.getByRole('button', { name: 'Valider ma sélection' }).click();
  await expect(page.locator('.pill-ok')).toContainText('✓ Validée');
  const nid = await nightIdOf(page);
  const draw = await page.request.post('/api/draw', { data: { nightId: nid, gameIds: [g] } });
  const { gameId } = await draw.json();
  const out = await page.request.post(`/api/nights/${nid}/box-out`, { data: { gameId } });
  expect(out.ok()).toBeTruthy();
  await page.goto('/etagere');
  await expect(page.locator('.badge-etat')).toContainText('En jeu');
  await expect(page.locator('.bandeau')).toContainText('Cascadia');
  // l'étagère est gelée : plus d'ajout, plus de validation
  await expect(page.getByRole('button', { name: /Ajouter des jeux/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Valider ma sélection' })).toHaveCount(0);
  // créateur : CTA vers le carnet des scores
  await expect(page.getByRole('link', { name: '🏁 Partie terminée' })).toBeVisible();
});
```

- [ ] **Step 2: Rouge** — `npx playwright test tests/e2e/etats-scores.spec.ts` → FAIL (pas de `.badge-etat`, pas de bandeau).

- [ ] **Step 3: Implémenter** — `app/etagere/page.tsx` :

```tsx
import { getActiveNight, getNightPlayers, getShelfGames, getNightGame, getTodayTermineeNight } from '@/lib/nights';
// dans la branche !night :
  const terminee = getTodayTermineeNight(user.id);
  return <main className="page">
    <UserSync />
    <div className="page-head"><h1>L&apos;étagère</h1><UserMenu me={user} /></div>
    {terminee && <TermineeCard nightId={terminee.id} gameTitle={terminee.game_title} />}
    <NightPicker users={users} prechecked={[user.id]} />
  </main>;
// dans le return actif :
  <ShelfClient night={night} partyGame={getNightGame(night.id)} …(reste inchangé) />
```

`components/TermineeCard.tsx` :

```tsx
import Link from 'next/link';
import { coverSrc } from '@/lib/formats';

// v3.3 — la soirée du jour est terminée : l'étagère repart vide, les scores
// vivent dans l'onglet Parties. (Le serveur ne passe que ce qui existe.)
export default function TermineeCard({ nightId, gameTitle }: { nightId: number; gameTitle: string | null }) {
  return (
    <section className="night-card terminee" aria-label="Soirée terminée">
      <div className="night-card-head">
        <span className="night-label">SOIRÉE DU JOUR</span>
        <span className="badge-etat b-term"><span className="pt" />Terminée</span>
      </div>
      <div className="bandeau g">
        <span className="b-cov">📦</span>
        <div><b>{gameTitle ?? 'Partie terminée'}</b><span>Scores enregistrés — retrouvez la soirée dans l&apos;onglet Parties.</span></div>
      </div>
      <Link className="btn-copper vert" href={`/nights/${nightId}`}>Voir les scores dans Parties →</Link>
    </section>
  );
}
```

`components/ShelfClient.tsx` : props `+ partyGame` ; le badge remplace le libellé selon l'état :

```tsx
// dans night-card-head :
  {night.status === 'en_jeu'
    ? <span className="badge-etat b-enjeu"><span className="pt" />En jeu</span>
    : <span className="badge-etat b-prep"><span className="pt" />En préparation</span>}
```

Mode `en_jeu` (night.status === 'en_jeu') : la carte affiche le bandeau vert (cover + « {partyGame.title} est sortie de l'étagère »), les chips/états et le lien « modifier » disparaissent, `partyGame` est filtrée des rangées (`list.filter(g => g.id !== partyGame?.id)`), « + Ajouter d'autres jeux » masqué, et la `cta-zone` :

```tsx
  <div className="cta-row">
    {estCreateur
      ? <a className="btn-copper pret" href={`/nights/${night.id}/scores`}>🏁 Partie terminée</a>
      : <span className="lance-par">En jeu — la boîte est sortie</span>}
  </div>
  <p className="cta-statut">{partyGame?.title} · {players.length} joueurs</p>
```

- [ ] **Step 4: CSS** — `app/globals.css` :

```css
/* v3.3 — l'état vit dans la carte d'étagère */
.badge-etat { display: inline-flex; align-items: center; gap: 7px; border-radius: 999px; padding: 5px 12px; font-size: 12px; font-weight: 600; }
.badge-etat .pt { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.b-prep { background: color-mix(in srgb, var(--cuivre) 16%, transparent); color: var(--cuivre); }
.b-enjeu { background: color-mix(in srgb, var(--vert) 16%, transparent); color: var(--vert); }
.b-term { background: color-mix(in srgb, var(--doux) 26%, transparent); color: var(--doux-clair); }
.night-card.enjeu { border-color: var(--vert); }
.night-card.terminee { border-color: color-mix(in srgb, var(--doux) 55%, transparent); }
.bandeau { display: flex; align-items: center; gap: 11px; margin-top: 12px; padding: 12px 13px; border-radius: 12px; font-size: 13px; line-height: 1.4; }
.bandeau .b-cov { width: 44px; height: 44px; border-radius: 8px; flex: none; display: grid; place-items: center; font-size: 20px; }
.bandeau.v { background: color-mix(in srgb, var(--vert) 13%, transparent); border: 1px solid color-mix(in srgb, var(--vert) 45%, transparent); }
.bandeau.v .b-cov { background: var(--vert); color: #fff; }
.bandeau.g { background: color-mix(in srgb, var(--doux) 12%, transparent); border: 1px solid color-mix(in srgb, var(--doux) 40%, transparent); }
.bandeau.g .b-cov { background: var(--doux); color: var(--noyer); }
.bandeau b { display: block; }
.bandeau span { color: var(--doux-clair); font-size: 12px; }
.btn-copper.vert { background: var(--vert); color: #fff; }
```

- [ ] **Step 5: Vert** — `npx playwright test tests/e2e/etats-scores.spec.ts` → PASS. Puis suites `etagere*.spec.ts` + `validation.spec.ts` (badge ajouté ne doit rien casser ; ajuster les sélecteurs qui comptaient le libellé « PARTIE EN COURS » s'il y en a).

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(étagère): badge d'état + bandeau en jeu + carte terminée"`

---

### Task 7: Le carnet des scores — `/nights/[id]/scores`

**Files:**
- Create: `app/nights/[id]/scores/page.tsx`
- Create: `components/ScoreCarnet.tsx`
- Modify: `components/TabBar.tsx` (masquer sur l'écran scores)
- Modify: `app/globals.css` (carnet)
- Test: `tests/e2e/etats-scores.spec.ts` (suite du fichier T6)

**Interfaces:**
- Consumes: T3 (`getNightScores`), T2 (`rankScores`, `MEDAILLES`), T4 (`POST end` avec scores).
- Produces: page `/nights/[id]/scores` — créateur seulement + `status='en_jeu'` (sinon redirect `/nights` ou `/etagere`) ; `ScoreCarnet({ nightId, game, players })` où `game: Game`, `players: UserLite[]` ; redirection finale `router.push('/nights/' + nightId)`.

- [ ] **Step 1: Test rouge** — suite de `tests/e2e/etats-scores.spec.ts` :

```ts
// Variante 2 joueurs — pattern établi (validation.spec.ts) : l'invité s'inscrit
// D'ABORD, le créateur recharge la liste, le coche, puis crée la partie.
async function registerAndStart2Joueurs(page: Page, pseudo: string, invitePseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const reg = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await reg;
  await page.reload(); // la liste des joueurs est rendue côté serveur
  await page.locator('.player-list label', { hasText: invitePseudo }).locator('input').check();
  const nightDone = page.waitForResponse((r) => r.url().endsWith('/api/nights') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Créer la partie' }).click();
  await nightDone;
}

test('carnet des scores : créateur seulement, médailles en direct, égalité, fin de partie', async ({ page, browser }) => {
  // Pattern établi (validation.spec.ts) : l'invité s'inscrit D'ABORD, le créateur
  // le coche dans la liste des joueurs puis crée la partie. Pseudos ≤ 20 car.
  const s = Date.now().toString(36);
  const invite = await browser.newContext();
  const p2 = await invite.newPage();
  await p2.goto('/register');
  await p2.getByLabel('Pseudo').fill(`inv-${s}`);
  await p2.getByLabel('Code secret').fill('1234');
  await p2.getByRole('button', { name: 'Créer mon compte' }).click();
  await p2.waitForURL('**/etagere');

  await registerAndStart2Joueurs(page, `car-${s}`, `inv-${s}`); // reload + check invité + Créer la partie
  const g = await newGame(page, 'Azul', 'petit');
  await putOnShelf(page, g);
  const nid = await nightIdOf(page);

  // l'invité ne peut PAS ouvrir le carnet (créateur seulement)
  await p2.goto(`/nights/${nid}/scores`);
  await expect(p2).toHaveURL(/\/(nights|etagere)$/);

  // le créateur sort la boîte et ouvre le carnet
  const draw = await page.request.post('/api/draw', { data: { nightId: nid, gameIds: [g] } });
  const { gameId } = await draw.json();
  await page.request.post(`/api/nights/${nid}/box-out`, { data: { gameId } });
  await page.goto(`/nights/${nid}/scores`);
  await expect(page.locator('.carnet')).toBeVisible();
  const inputs = page.locator('.score-in');
  await inputs.nth(0).fill('24');
  await inputs.nth(1).fill('19');
  await expect(page.locator('.carnet .med').nth(0)).toHaveText('👑');
  await expect(page.locator('.carnet .med').nth(1)).toHaveText('🥈');
  // égalité : même médaille (rankScores dense)
  await inputs.nth(1).fill('24');
  await expect(page.locator('.carnet .med').nth(1)).toHaveText('👑');
  await page.getByRole('button', { name: '✓ Enregistrer et terminer' }).click();
  await page.waitForURL(`**/nights/${nid}`);
  await expect(page.locator('.pod1')).toContainText('👑');
});
```

- [ ] **Step 2: Rouge** — `npx playwright test tests/e2e/etats-scores.spec.ts -g carnet` → FAIL (404 sur la route).

- [ ] **Step 3: Implémenter** — `app/nights/[id]/scores/page.tsx` :

```tsx
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { getNight, getNightPlayers, getNightGame, getNightScores } from '@/lib/nights';
import ScoreCarnet from '@/components/ScoreCarnet';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const night = getNight(Number((await params).id));
  if (!night || night.creator_id !== user.id) redirect('/nights');
  if (night.status === 'creation') redirect(`/tirage/${night.id}`);
  if (night.status !== 'en_jeu') redirect(`/nights/${night.id}`);
  return <main className="page score-page">
    <ScoreCarnet nightId={night.id} game={getNightGame(night.id)!} players={getNightPlayers(night.id)}
                 dejaSaisis={getNightScores(night.id)} />
  </main>;
}
```

`components/ScoreCarnet.tsx` :

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { avatarSrc } from '@/lib/formats';
import { rankScores, MEDAILLES } from '@/lib/ranks';
import type { Game, UserLite } from '@/lib/types';

type Deja = { user_id: number; score: number | null };

// Le carnet des scores : image du jeu, un joueur par ligne, score à droite,
// médailles placées en direct (rankScores — égalité = même médaille).
export default function ScoreCarnet({ nightId, game, players, dejaSaisis }: {
  nightId: number; game: Game; players: UserLite[]; dejaSaisis: Deja[];
}) {
  const router = useRouter();
  const [scores, setScores] = useState<Record<number, string>>(
    Object.fromEntries(players.map((p) => [p.id, String(dejaSaisis.find((d) => d.user_id === p.id)?.score ?? '')])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ranks = new Map(rankScores(players.map((p) => ({ user_id: p.id, score: scores[p.id] === '' ? null : Number(scores[p.id]) })))
    .map((r) => [r.user_id, r.rank]));

  async function terminer(avecScores: boolean) {
    setBusy(true); setError(null);
    const clean: Record<string, number> = {};
    for (const [id, v] of Object.entries(scores)) if (v !== '' && Number.isFinite(Number(v))) clean[id] = Number(v);
    const res = await fetch(`/api/nights/${nightId}/end`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(avecScores ? { scores: clean } : {}),
    });
    if (!res.ok) { setError((await res.json()).error ?? 'Impossible'); setBusy(false); return; }
    router.push(`/nights/${nightId}`);
  }

  return (
    <div className="carnet-ecran">
      <div className="carnet-head">
        <span className="cov"><BoxImage game={game} /></span>
        <div><h3>{game.title}</h3><p>Le carnet des scores · {players.length} joueurs</p></div>
      </div>
      <div className="carnet">
        {players.map((p) => (
          <div key={p.id} className="carnet-row">
            <span className="avs">{avatarSrc(p) ? <img src={avatarSrc(p)!} alt="" /> : p.sticker ?? '🎲'}</span>
            <span className="ps"><b>{p.pseudo}</b></span>
            <input className="score-in" type="number" inputMode="decimal" placeholder="score"
                   value={scores[p.id] ?? ''} onChange={(e) => setScores((s) => ({ ...s, [p.id]: e.target.value }))}
                   aria-label={`Score de ${p.pseudo}`} />
            <span className={'med' + (ranks.get(p.id) && ranks.get(p.id)! <= 3 ? ' on' : '')}
                  aria-hidden="true">{MEDAILLES[(ranks.get(p.id) ?? 9) - 1] ?? ''}</span>
          </div>
        ))}
      </div>
      <p className="egalite" id="egalite">Le classement se met à jour en direct — les ex æquo portent la même médaille</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="carnet-foot">
        <button type="button" className="btn-copper" disabled={busy} onClick={() => terminer(true)}>✓ Enregistrer et terminer</button>
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => terminer(false)}>Terminer sans scores</button>
      </div>
    </div>
  );
}
```

(`BoxImage` existe déjà ; importer. `avatarSrc` de `lib/formats`.)

`components/TabBar.tsx` — dans le garde :

```ts
  if (path === '/' || HIDDEN.includes(path) || path.endsWith('/scores')) return null;
```

- [ ] **Step 4: CSS** — `app/globals.css` (classes `.carnet`, `.carnet-row`, `.avs`, `.score-in` 16 px obligatoire, `.med`, `.egalite`, `.carnet-foot`, `.cov-demo` → réutiliser `.cov` existant pour l'image ; reprendre les valeurs de la maquette validée, section « le carnet des scores »).

- [ ] **Step 5: Vert** — `npx playwright test tests/e2e/etats-scores.spec.ts` → PASS. Adapter `TerminerNight` : son bouton « Terminer la partie » sur `/nights` (soirée active) redirige désormais vers le carnet si `status='en_jeu'` (créateur) — sinon conserve le double-appui pour l'abandon en `creation` :

```tsx
// components/TerminerNight.tsx — la partie en jeu passe par le carnet :
  if (status === 'en_jeu') return <a className="btn-ghost end-btn" href={`/nights/${nightId}/scores`}>🏁 Partie terminée</a>;
```
(nouvelle prop `status` passée par `app/nights/page.tsx`.)

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(scores): le carnet des scores — plein écran créateur, médailles en direct"`

---

### Task 8: Détail de soirée + historique à cartes

**Files:**
- Create: `app/nights/[id]/page.tsx` + `components/PartagerResultats.tsx`
- Modify: `lib/announce.ts` (`buildPodiumMessage`) + `tests/unit/announce.test.ts`
- Modify: `app/nights/page.tsx` (historique → cartes ; « Ce soir » → badge + jeu de partie au lieu des picks cumulés)
- Test: `tests/e2e/etats-scores.spec.ts` (suite), `tests/unit/announce.test.ts`

**Interfaces:**
- Consumes: T3 (`getNight`, `getNightGame`, `getNightScores`, `getHistoryCards`, `userCanAccessNight`), T2 (`rankScores`, `medaille`).
- Produces: page `/nights/[id]` (joueurs de la soirée) ; `buildPodiumMessage({ title, classement }): string` avec `classement: { pseudo: string; score: number; rank: number }[]`.

- [ ] **Step 1: Test rouge unitaire** — `tests/unit/announce.test.ts` :

```ts
it('construit le message de podium WhatsApp', () => {
  const msg = buildPodiumMessage({ title: 'Cascadia', classement: [
    { pseudo: 'Marc', score: 24, rank: 1 }, { pseudo: 'Lucie', score: 24, rank: 1 }, { pseudo: 'Théo', score: 15, rank: 2 },
  ] });
  expect(msg).toContain('Cascadia');
  expect(msg).toContain('👑 Marc & Lucie — 24 pts');
  expect(msg).toContain('🥈 Théo — 15 pts');
});
```

- [ ] **Step 2: Rouge** — `npx vitest run tests/unit/announce.test.ts` → FAIL.

- [ ] **Step 3: Implémenter** — `lib/announce.ts` (importer `medaille` de `./ranks`, réutiliser `frJoin`) :

```ts
// Podium partagé : 👑 les premiers (ex æquo groupés), puis 🥈/🥉, puis le reste.
export function buildPodiumMessage({ title, classement }: { title: string; classement: { pseudo: string; score: number; rank: number }[] }): string {
  const lignes: string[] = [];
  for (let r = 1; r <= Math.max(3, ...classement.map((c) => c.rank)); r++) {
    const duRang = classement.filter((c) => c.rank === r);
    if (duRang.length === 0) continue;
    const med = medaille(r) || '•';
    lignes.push(`${med} ${frJoin(duRang.map((c) => c.pseudo))} — ${duRang[0].score} pts`);
  }
  return `🎲 ${title} — c'est fini !\n${lignes.join('\n')}`;
}
```

- [ ] **Step 4: Pages** — `app/nights/[id]/page.tsx` :

```tsx
import { notFound, redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { getNight, userCanAccessNight, getNightGame, getNightScores } from '@/lib/nights';
import { rankScores } from '@/lib/ranks';
import { coverSrc, avatarSrc } from '@/lib/formats';
import BoxImage from '@/components/BoxImage';
import PartagerResultats from '@/components/PartagerResultats';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const night = getNight(Number((await params).id));
  if (!night || !userCanAccessNight(user.id, night.id)) notFound();
  const game = getNightGame(night.id);
  const scores = getNightScores(night.id);
  const classe = rankScores(scores);
  const un = classe.filter((c) => c.rank === 1), deux = classe.filter((c) => c.rank === 2), trois = classe.filter((c) => c.rank === 3);
  const autres = classe.filter((c) => c.rank > 3);
  const Av = ({ u }: { u: { pseudo: string; sticker: string | null; avatar_path: string | null } }) =>
    avatarSrc(u) ? <img className="avs" src={avatarSrc(u)!} alt="" /> : <span className="avs">{u.sticker ?? '🎲'}</span>;
  return (
    <main className="page detail-page">
      <a className="retour-btn" href="/nights">← Parties</a>
      <div className="dt-hero">
        {game && <span className="cov dt-cov"><BoxImage game={game} /></span>}
        <div><h3>{game?.title ?? 'Soirée de jeux'}</h3>
          <p>{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(`${night.played_at}T12:00:00`))} · {classe.length} joueurs</p></div>
      </div>
      <span className="badge-etat b-term"><span className="pt" />Terminée</span>
      {classe.length === 0 ? (
        <p className="sans-score">Pas de scores ce soir — la partie est dans les annales.</p>
      ) : (
        <>
          <p className="pod-lb">LE PODIUM</p>
          <div className="pod1"><Av u={un[0]} /><span className="pd"><b>{un.map((x) => x.pseudo).join(' & ')}</b><span>👑 première place</span></span><span className="sc">{un[0].score}</span></div>
          {(deux.length > 0 || trois.length > 0) && (
            <div className="pod23">
              {deux.map((x) => <div key={x.user_id} className="p"><Av u={x} /><div><b>{x.pseudo}</b><span>🥈 {x.score} pts</span></div></div>)}
              {trois.map((x) => <div key={x.user_id} className="p"><Av u={x} /><div><b>{x.pseudo}</b><span>🥉 {x.score} pts</span></div></div>)}
            </div>
          )}
          {autres.length > 0 && (
            <div className="pod-autres">
              {autres.map((x) => <div key={x.user_id}><span className="avs avs-sm">{x.sticker ?? '🎲'}</span><span>{x.pseudo}</span><span className="sc">{x.score}</span></div>)}
            </div>
          )}
        </>
      )}
      <PartagerResultats titre={game?.title ?? 'Soirée de jeux'} classement={classe.map((c) => ({ pseudo: c.pseudo, score: c.score as number, rank: c.rank }))} />
    </main>
  );
}
```

`components/PartagerResultats.tsx` : bouton ghost « 💬 Partager les résultats » → `shareMessage(buildPodiumMessage(...))` (pattern `TirageClient`). Rendu conditionnel : rien si `classement.length === 0`.

`app/nights/page.tsx` — historique : remplacer la liste actuelle par :

```tsx
  const cartes = getHistoryCards(user.id);
  <section className="qg-section" aria-label="Historique">
    <h2>Historique</h2>
    <div className="hist-liste">
      {cartes.map((n) => (
        <a key={n.id} className="hist-card" href={`/nights/${n.id}`}>
          <span className="hc"><b>{n.game_title ?? 'Soirée de jeux'}</b>
            <span className="gagnant">{n.gagnant_pseudo ? `👑 ${n.gagnant_pseudo} · ${n.gagnant_score} pts` : 'pas de scores'}</span></span>
          <span className="dt"><span className="med-mini">{medaille(1)}</span><span>{dateFormat.format(new Date(`${n.played_at}T12:00:00`))}</span></span>
        </a>
      ))}
      {cartes.length === 0 && <p className="hint">Aucune partie terminée — tout est devant vous.</p>}
    </div>
  </section>
```

Et la carte « Ce soir » : badge d'état + (si `game_id`) ligne jeu de partie — **supprimer la liste `night-picks`** (les picks cumulés ne s'affichent plus nulle part ; `getNightPicks` reste en lib pour l'audit mais n'est plus importé ici).

- [ ] **Step 5: CSS** — `app/globals.css` : `.hist-card`, `.hist-liste`, `.dt-hero`, `.pod1`, `.pod23`, `.pod-autres`, `.pod-lb`, `.retour-btn`, `.sans-score` (valeurs de la maquette validée, sections « historique » et « podium »).

- [ ] **Step 6: E2E rouge→vert** — suite de `tests/e2e/etats-scores.spec.ts` :

```ts
test('historique : une carte par partie, détail avec podium et partage', async ({ page }) => {
  // (reprend la soirée terminée du test précédent via un nouveau compte complet :
  //  création → boîte → scores → puis visite de /nights)
  // … préparation identique au test carnet, 3 joueurs, scores 24/19/10 …
  await page.goto('/nights');
  await expect(page.locator('.hist-card').first()).toContainText('Cascadia');
  await expect(page.locator('.hist-card .gagnant').first()).toContainText('👑');
  await page.locator('.hist-card').first().click();
  await page.waitForURL('**/nights/*');
  await expect(page.locator('.pod1')).toContainText('👑');
  await expect(page.locator('.pod23')).toContainText('🥈');
  await expect(page.locator('.pod-autres')).toContainText('10');
});
test('soirée migrée sans scores : détail sobre, aucune erreur', async ({ page }) => {
  // partie terminée sans scores (bouton « Terminer sans scores ») → détail :
  await expect(page.locator('.sans-score')).toBeVisible();
});
```

- [ ] **Step 7: Vert + commit** — `npx playwright test tests/e2e/etats-scores.spec.ts` PASS ; `git add -A && git commit -m "feat(historique): détail de soirée avec podium + cartes gagnant"`

---

### Task 9: Profil — podiums comptés, « Mes parties » médailles

**Files:**
- Modify: `lib/users.ts` (`getProfileStats` + `getMyParties`)
- Modify: `app/profil/page.tsx` + `components/ProfileClient.tsx`
- Modify: `app/globals.css` (`.stats`, `.mes-parties` — maquette)
- Test: `tests/unit/users.test.ts`, `tests/e2e/profil.spec.ts` (ajout)

**Interfaces:**
- Consumes: T2 (`rankScores`, `medaille`), T3 (`getHistoryCards`-style SQL), T8 (pages détail cibles des liens).
- Produces: `getProfileStats(userId): { plays, nights, games, podiums: { un: number; deux: number; trois: number } }` ; `getMyParties(userId: number, limit?: number): { id, played_at, game_title, cover_path, cover_url, score }[]` (mes soirées terminées avec score, ma médaille calculée en JS via `rankScores`).

- [ ] **Step 1: Test rouge** — `tests/unit/users.test.ts` :

```ts
it('compte les podiums et liste mes parties avec ma médaille', () => {
  const a = (registerUser('u-pod-a', '1234') as { id: number }).id;
  const b = (registerUser('u-pod-b', '1234') as { id: number }).id;
  // deux soirées, chacune avec son jeu posé avant la sortie de boîte
  const n1 = createNight(a, [a, b]);
  const g1 = createGame(a, { title: 'Cascadia', box_format: 'moyen' });
  addNightGame(n1, g1, a);
  boxOutNight(n1, a, g1.id);
  const n2 = createNight(a, [a, b]);
  const g2 = createGame(a, { title: 'Azul', box_format: 'petit' });
  addNightGame(n2, g2, a);
  boxOutNight(n2, a, g2.id);
  // n1 : a premier ; n2 : a deuxième
  endNight(n1, a, { [a]: 24, [b]: 19 });
  endNight(n2, a, { [a]: 10, [b]: 30 });
  const stats = getProfileStats(a);
  expect(stats.podiums).toEqual({ un: 1, deux: 1, trois: 0 });
  const parties = getMyParties(a);
  expect(parties).toHaveLength(2);
  expect(parties.map((p) => p.score).sort((x, y) => (x ?? 0) - (y ?? 0))).toEqual([10, 24]);
  expect(parties.every((p) => p.game_title)).toBe(true);
});
```

(rédigé complet dans la vraie tâche : `createGame` + `addNightGame` avant chaque `boxOutNight`.)

- [ ] **Step 2: Rouge** — `npx vitest run tests/unit/users.test.ts` → FAIL (`podiums` absent, `getMyParties` inconnu).

- [ ] **Step 3: Implémenter** — `lib/users.ts` :

```ts
// Podiums : DENSE_RANK par soirée (égalité = même médaille), scores non nuls uniquement.
const podiums = (userId: number) => {
  const r = getDb().prepare(`
    SELECT SUM(CASE WHEN rank = 1 THEN 1 ELSE 0 END) AS un,
           SUM(CASE WHEN rank = 2 THEN 1 ELSE 0 END) AS deux,
           SUM(CASE WHEN rank = 3 THEN 1 ELSE 0 END) AS trois
    FROM (SELECT DENSE_RANK() OVER (PARTITION BY night_id ORDER BY score DESC) AS rank
          FROM night_scores WHERE user_id = ? AND score IS NOT NULL)`).get(userId) as { un: number | null; deux: number | null; trois: number | null };
  return { un: r.un ?? 0, deux: r.deux ?? 0, trois: r.trois ?? 0 };
};

export function getMyParties(userId: number, limit = 6) {
  return getDb().prepare(`
    SELECT n.id, n.played_at, g.title AS game_title, g.cover_path, g.cover_url, ns.score
    FROM nights n
    JOIN night_scores ns ON ns.night_id = n.id AND ns.user_id = ?
    LEFT JOIN games g ON g.id = n.game_id
    WHERE n.status = 'termine'
    ORDER BY n.played_at DESC, n.id DESC LIMIT ?`).all(userId, limit) as { id: number; played_at: string; game_title: string | null; cover_path: string | null; cover_url: string | null; score: number | null }[];
}
```

`getProfileStats` retourne `{ plays, nights, games, podiums }`. `app/profil/page.tsx` passe `parties={getMyParties(user.id)}`. `ProfileClient` : 3ᵉ stat = podiums (`👑 a · 🥈 b · 🥉 c` — même vocabulaire que la maquette), nouvelle section « MES PARTIES » (lignes cover + titre + date + score + médaille, lien `/nights/[id]` ; la médaille vient de `rankScores` sur `getNightScores(n.id)` — côté serveur : la page calcule les rangs et passe `medaille` en string pour éviter N requêtes client — implémentation : `app/profil/page.tsx` construit `parties = getMyParties(user.id).map((p) => ({ ...p, med: medaille(rank) }))` en calculant les rangs avec `getNightScores` + `rankScores` par partie).

- [ ] **Step 4: E2E** — `tests/e2e/profil.spec.ts` (ajout) :

```ts
test('profil : podiums dans les stats et mes parties médailles', async ({ page }) => {
  // flux complet court (2 joueurs, 1 partie, scores 24/19) puis :
  await page.goto('/profil');
  await expect(page.locator('.stat', { hasText: 'podiums' })).toContainText('👑');
  await expect(page.locator('.mp-row').first()).toContainText('Cascadia');
  await expect(page.locator('.mp-row .med').first()).toHaveText('👑');
});
```

- [ ] **Step 5: Vert + commit** — suites vertes ; `git add -A && git commit -m "feat(profil): podiums comptés + mes parties avec médailles"`

---

### Task 10: Version 3.3.0 — CHANGELOG, ledger, suites complètes

**Files:**
- Modify: `package.json` (`"version": "3.3.0"`)
- Modify: `CHANGELOG.md` (entrée 3.3.0 : Ajouté = états, carnet, détail, profil médailles ; Corrigé = accumulation des relances)
- Modify: `.superpowers/sdd/2026-10-01-soirees-programmees/progress.md` (rulings : box-out = état serveur, `picks` = audit seulement, rankScores dense)

- [ ] **Step 1: Suites de référence** — `npx vitest run` (unitaires verts) ; `npx playwright test` (E2E verts, workers 1) ; `npx tsc --noEmit` propre. Tout doit passer AVANT le bump.
- [ ] **Step 2: Bump + CHANGELOG** — `"version": "3.3.0"` + entrée CHANGELOG datée 2026-10-02.
- [ ] **Step 3: Commit** — `git commit -m "chore: v3.3.0"` ; push ; PR ; deux runs CI verts ; merge ; tag `v3.3.0` après merge + CI main verte ; release GitHub Latest ; vérifier `curl -s https://etagere.marc-suarez.fr/sw.js | grep -o "wsp-v[0-9.]*"` = `wsp-v3.3.0`.
