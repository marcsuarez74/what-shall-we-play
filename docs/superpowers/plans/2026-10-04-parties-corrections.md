# Corrections de parties : éditer, supprimer, créer en retard (v4.2.0) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une partie terminée peut être corrigée (jeu / date / participants / scores) ou supprimée par son créateur et ses participants, et une partie jouée sans l'app se note rétroactivement en un seul geste — les stats de profils suivent automatiquement.

**Architecture:** Zéro nouvelle table — `DELETE FROM nights` cascade tout (scores, picks, verdicts, joueurs). Trois fonctions serveur dans `lib/nights.ts` (`corrigerNuit`, `supprimerNuit`, `creerNuitRetro`) sont les garants des règles ; le PATCH existant de `app/api/nights/[id]/route.ts` s'étend (partiel, sémantique différenciée selon le statut), un `DELETE` y est ajouté, et `POST /api/nights/retro` naît. L'UI est un bloc dépliable sur la page de la partie terminée (`CorrigerPartie`) et un formulaire dans Mes parties (`CreerPartiePassee`), textes issus de la maquette validée.

**Tech Stack:** Next.js App Router (server components + client components), SQLite better-sqlite3, dictionnaires i18n typés FR/EN, Vitest + Playwright.

**Spec:** `docs/superpowers/specs/2026-10-04-parties-design.md` (décisions 2-4, 6-7 — le présent plan couvre v4.2.0 seulement ; la maquette validée est `.superpowers/brainstorm/65728-1791127561/content/maquette-v41-parties.html`, onglets 1, 3, 4).

## Global Constraints

- Suite verte avant toute fin de tâche : `npx vitest run` + `npx playwright test` + `npx tsc --noEmit`.
- Toute chaîne UI passe par les dicts (`lib/i18n/fr.ts` puis `lib/i18n/en.ts` — complétude forcée par `npx tsc --noEmit`). Apostrophes typographiques U+2019 dans les valeurs FR (« l'anci… », « aujourd'hui ») comme le style existant.
- Accroches E2E (aria-label, textes épinglés) mises à jour/posées **dans le même commit** que les libellés (AGENTS.md §3).
- **Garde-fou AGENTS.md §4 : une donnée n'est jamais détruite implicitement — suppressions explicites et confirmées.** La modale de suppression liste CE qui disparaît ; le retrait d'un participant et le changement de jeu passent par le bouton « Enregistrer » qui suit l'alerte inline.
- Droits : créateur **OU participant** (choix client) ; les autres → 404 (pattern `userCanAccessNight`).
- Une date de partie jamais dans le futur (validation **serveur** ; le `max` HTML n'est qu'un confort).
- Pas de nouvelle dépendance, pas de SSE nouveau (`notifyNight` existant seulement). Version cible : **4.2.0** — bump en Task 6 seulement.
- Styles : variables CSS existantes (`--noyer, --surface, --surface-plus, --creme, --cuivre, --vert, --rouge, --ambre, --doux, --doux-clair`), boutons et cartes du même vocabulaire que `.pastille`/`.verdict`.

## Review Focus

1. **Retrait d'un participant qui a des scores** : le retrait doit supprimer SES `night_scores` — un `setNightPlayers` brut laisserait des scores orphelins (partie fantôme dans les stats). Épinglé par unit T1 (`corrigerNuit` : retrait → scores partis).
2. **Le reset des verdicts ne part que si le jeu CHANGE réellement** — renvoyer le même `game_id` garde les verdicts. Épinglé par unit T1 (même jeu → verdicts intacts).
3. **Date future rejetée au serveur** — un POST direct sans l'UI doit 400 (le `max` HTML n'est pas une sécurité). Épinglé par unit T1 et T3, et E2E T5 (date de demain → message d'erreur affiché).
4. **`DELETE FROM nights` avec des picks** : `picks.game_id` est `ON DELETE RESTRICT` mais `picks.night_id` est `CASCADE` — la suppression de la NUIT doit tout emporter sans erreur. Épinglé par unit T2 (nuit avec picks → toutes les tables vides après).
5. **Le LEFT JOIN de `getMyParties` ne doit pas dévoiler les nuits d'autrui** — le filtre `(creator_id = ? OR EXISTS night_players)` REMPLACE le filtre implicite qu'était le INNER JOIN `night_scores`. Épinglé par unit T5 (nuit terminée d'un autre → absente de Mes parties).

---

### Task 1: `corrigerNuit` + PATCH étendu (lib + route)

**Files:**
- Modify: `lib/nights.ts` (ajouter `corrigerNuit` après `endNight`, ~l.137)
- Modify: `app/api/nights/[id]/route.ts` (remplacer le corps du PATCH, ajouter l'import `NuitPatch`/`corrigerNuit`)
- Modify: `lib/i18n/fr.ts` + `lib/i18n/en.ts` (2 clés — `errDateInvalide`, `errJeuIntrouvable`, `errScoreInvalide` existent déjà et sont réutilisées)
- Test: `tests/unit/nights-edit.test.ts` (nouveau)

**Interfaces:**
- Consumes: `getNight`, `userCanAccessNight`, `notifyNight`, `NightStateError`, `t(lang, clé)` (tous existants).
- Produces: `corrigerNuit(nightId: number, userId: number, patch: NuitPatch, lang?: Lang): { ok: true } | NightStateError` avec `type NuitPatch = { playedAt?: string; gameId?: number; playerIds?: number[]; scores?: Record<string, number> }` — Task 4 (UI) et Task 2 (même fichier) s'appuient sur cette signature.

- [ ] **Step 1: Écrire les tests unitaires qui échouent**

`tests/unit/nights-edit.test.ts` (idiome de `tests/unit/nights.test.ts` : vraie DB via `getDb()`, `registerUser`, `createGame`) :

```typescript
import { describe, it, expect } from 'vitest';
import { registerUser } from '@/lib/auth';
import { createGame } from '@/lib/games';
// Tasks 2-3 étendront cet import avec supprimerNuit puis creerNuitRetro (et getMyParties en Task 5).
import { createNight, corrigerNuit, getNight, getNightScores, getNightPlayers } from '@/lib/nights';
import { poserVerdict } from '@/lib/verdicts';
import { getDb } from '@/lib/db';

const hier = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE');
const demain = new Date(Date.now() + 86400000).toLocaleDateString('sv-SE');

/** Nuit terminée avec scores, prête à corriger. */
function nuitTerminee() {
  const marc = (registerUser(`e-marc-${Math.random().toString(36).slice(2, 8)}`, '1234') as { id: number }).id;
  const lea = (registerUser(`e-lea-${Math.random().toString(36).slice(2, 8)}`, '1234') as { id: number }).id;
  const game = createGame(marc, { title: 'Cascadia', box_format: 'grand' });
  const nightId = createNight(marc, [marc, lea]);
  getDb().prepare(`UPDATE nights SET game_id = ?, status = 'termine', ended_at = datetime('now','localtime') WHERE id = ?`).run(game, nightId);
  getDb().prepare('INSERT OR REPLACE INTO night_scores (night_id, user_id, score) VALUES (?, ?, ?)').run(nightId, marc, 78);
  getDb().prepare('INSERT OR REPLACE INTO night_scores (night_id, user_id, score) VALUES (?, ?, ?)').run(nightId, lea, 71);
  return { marc, lea, autre: (registerUser(`e-autre-${Math.random().toString(36).slice(2, 8)}`, '1234') as { id: number }).id, game, game2: createGame(marc, { title: 'Everdell', box_format: 'moyen' }), nightId };
}

describe('corrigerNuit', () => {
  it('droits : créateur et participant peuvent corriger, un autre reçoit 404', () => {
    const n = nuitTerminee();
    expect(corrigerNuit(n.nightId, n.marc, { scores: { [n.marc]: 80 } })).toEqual({ ok: true });
    expect(corrigerNuit(n.nightId, n.lea, { scores: { [n.lea]: 72 } })).toEqual({ ok: true });
    expect(corrigerNuit(n.nightId, n.autre, { scores: { [n.marc]: 1 } }).status).toBe(404);
  });
  it('date : passée ou aujourd\'hui ok, jamais dans le futur (400)', () => {
    const n = nuitTerminee();
    expect(corrigerNuit(n.nightId, n.marc, { playedAt: hier })).toEqual({ ok: true });
    expect(getNight(n.nightId)!.played_at).toBe(hier);
    expect(corrigerNuit(n.nightId, n.marc, { playedAt: demain }).status).toBe(400);
    expect(corrigerNuit(n.nightId, n.marc, { playedAt: 'pas-une-date' }).status).toBe(400);
  });
  it('changement de jeu → verdicts réinitialisés ; même jeu → verdicts intacts', () => {
    const n = nuitTerminee();
    poserVerdict(n.nightId, n.marc, 'adore');
    expect(corrigerNuit(n.nightId, n.marc, { gameId: n.game })).toEqual({ ok: true }); // même jeu
    expect(getDb().prepare('SELECT COUNT(*) AS c FROM night_verdicts WHERE night_id = ?').get(n.nightId).c).toBe(1);
    expect(corrigerNuit(n.nightId, n.marc, { gameId: n.game2 })).toEqual({ ok: true }); // autre jeu
    expect(getDb().prepare('SELECT COUNT(*) AS c FROM night_verdicts WHERE night_id = ?').get(n.nightId).c).toBe(0);
    expect(getNight(n.nightId)!.game_id).toBe(n.game2);
  });
  it('retrait d\'un participant → ses scores et ses votes partent ; scores upsert', () => {
    const n = nuitTerminee();
    getDb().prepare('INSERT OR IGNORE INTO game_votes (night_id, game_id, user_id) VALUES (?, ?, ?)').run(n.nightId, n.game, n.lea);
    expect(corrigerNuit(n.nightId, n.marc, { playerIds: [n.marc] })).toEqual({ ok: true });
    expect(getNightPlayers(n.nightId).map((p) => p.id)).toEqual([n.marc]);
    expect(getNightScores(n.nightId).map((s) => s.user_id)).toEqual([n.marc]); // les scores de lea partis
    expect(getDb().prepare('SELECT COUNT(*) AS c FROM game_votes WHERE night_id = ?').get(n.nightId).c).toBe(0);
    expect(corrigerNuit(n.nightId, n.marc, { scores: { [n.marc]: 82, [n.lea]: 1 } }).status).toBe(400); // score d'un absent
    expect(corrigerNuit(n.nightId, n.marc, { scores: { [n.marc]: 82 } })).toEqual({ ok: true });
    expect(getNightScores(n.nightId)[0].score).toBe(82);
  });
  it('seule une nuit terminée se corrige (409) ; joueur inconnu (400)', () => {
    const marc = (registerUser(`e-vif-${Math.random().toString(36).slice(2, 8)}`, '1234') as { id: number }).id;
    const nightId = createNight(marc, [marc]); // status 'creation'
    expect(corrigerNuit(nightId, marc, { playedAt: hier }).status).toBe(409);
    const n = nuitTerminee();
    expect(corrigerNuit(n.nightId, n.marc, { playerIds: [999999] }).status).toBe(400);
  });
});
```

(Le `describe('supprimerNuit')` et `creerNuitRetro` arrivent en Tasks 2-3 — ne les écris pas encore.)

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run tests/unit/nights-edit.test.ts`
Expected: FAIL — `corrigerNuit` n'est pas exportée par `@/lib/nights`.

- [ ] **Step 3: Implémenter `corrigerNuit` dans lib/nights.ts**

Après `endNight` (~l.137), ajouter :

```typescript
// Date ISO réelle (format + calendaire) et passée ou aujourd'hui — même rigueur
// que validIsoDate de POST /api/nights : '2026-02-31' est rejeté, pas seulement
// le mauvais format. Partagée par corrigerNuit et creerNuitRetro.
function datePasseeValide(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00`); // midi : immune aux pièges de minuit
  return !Number.isNaN(d.getTime()) && d.toLocaleDateString('sv-SE') === s && s <= new Date().toLocaleDateString('sv-SE');
}

// v4.2.0 — corriger une partie terminée : date, jeu, participants, scores.
// Droits : créateur OU participant (choix client). Le changement de jeu
// réinitialise les verdicts de la nuit — l'UI alerte et confirme avant d'envoyer.
// Le retrait d'un participant emporte ses scores et ses votes (pas de fantôme).
export type NuitPatch = { playedAt?: string; gameId?: number; playerIds?: number[]; scores?: Record<string, number> };
export function corrigerNuit(nightId: number, userId: number, patch: NuitPatch, lang: Lang = 'fr'): { ok: true } | NightStateError {
  const night = getNight(nightId);
  if (!night) return { error: t(lang, 'erreurs.soireeIntrouvable'), status: 404 };
  if (!userCanAccessNight(userId, nightId)) return { error: t(lang, 'erreurs.soireeIntrouvable'), status: 404 };
  if (night.status !== 'termine') return { error: t(lang, 'soiree.errCorrigerNonTerminee'), status: 409 };
  const db = getDb();
  if (patch.playedAt !== undefined && !datePasseeValide(patch.playedAt))
    return { error: t(lang, 'soiree.errDateInvalide'), status: 400 }; // clé existante (Planifier) réutilisée
  let jeuChange = false;
  if (patch.gameId !== undefined) {
    if (!db.prepare('SELECT 1 FROM games WHERE id = ?').get(patch.gameId)) return { error: t(lang, 'soiree.errJeuIntrouvable'), status: 400 };
    jeuChange = patch.gameId !== night.game_id;
  }
  if (patch.playerIds !== undefined) {
    if (!patch.playerIds.includes(userId)) return { error: t(lang, 'soiree.errDoitEtreDansSoiree'), status: 400 };
    for (const pid of patch.playerIds)
      if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(pid)) return { error: t(lang, 'soiree.errJoueurIntrouvable'), status: 400 };
  }
  const joueursFinaux = new Set(patch.playerIds ?? (db.prepare('SELECT user_id FROM night_players WHERE night_id = ?').all(nightId) as { user_id: number }[]).map((r) => r.user_id));
  if (patch.scores) {
    for (const [k, v] of Object.entries(patch.scores))
      if (!joueursFinaux.has(Number(k)) || !Number.isFinite(v)) return { error: t(lang, 'soiree.errScoreInvalide'), status: 400 };
  }
  db.transaction(() => {
    if (patch.playedAt !== undefined) db.prepare('UPDATE nights SET played_at = ? WHERE id = ?').run(patch.playedAt, nightId);
    if (patch.gameId !== undefined) {
      db.prepare('UPDATE nights SET game_id = ? WHERE id = ?').run(patch.gameId, nightId);
      if (jeuChange) db.prepare('DELETE FROM night_verdicts WHERE night_id = ?').run(nightId); // l'UI a confirmé avant d'envoyer
    }
    if (patch.playerIds !== undefined) {
      const avant = (db.prepare('SELECT user_id FROM night_players WHERE night_id = ?').all(nightId) as { user_id: number }[]).map((r) => r.user_id);
      db.prepare('DELETE FROM night_players WHERE night_id = ?').run(nightId);
      const ins = db.prepare('INSERT OR IGNORE INTO night_players (night_id, user_id) VALUES (?, ?)');
      for (const id of new Set(patch.playerIds)) ins.run(nightId, id);
      for (const id of avant) if (!patch.playerIds.includes(id))
        db.prepare('DELETE FROM night_scores WHERE night_id = ? AND user_id = ?').run(nightId, id);
      db.prepare('DELETE FROM game_votes WHERE night_id = ? AND user_id NOT IN (SELECT user_id FROM night_players WHERE night_id = ?)').run(nightId, nightId);
    }
    if (patch.scores) {
      const ins = db.prepare('INSERT OR REPLACE INTO night_scores (night_id, user_id, score) VALUES (?, ?, ?)');
      for (const [k, v] of Object.entries(patch.scores)) ins.run(nightId, Number(k), Number(v));
    }
  })();
  notifyNight(nightId); // idiome existant (pas de canal SSE nouveau) — les vues RSC se rafraîchissent
  return { ok: true };
}
```

- [ ] **Step 4: Ajouter les 2 clés aux deux dicts**

`lib/i18n/fr.ts` (bloc « Erreurs retournées par les routes parties/tirage », après `soiree.errDoitEtreDansSoiree`) :

```typescript
  'soiree.errCorrigerNonTerminee': 'Seule une partie terminée peut être corrigée',
  'soiree.errJoueurIntrouvable': 'Joueur introuvable',
```

`lib/i18n/en.ts` (même emplacement) :

```typescript
  'soiree.errCorrigerNonTerminee': 'Only a finished game can be corrected',
  'soiree.errJoueurIntrouvable': 'Player not found',
```

(`soiree.errDateInvalide` — « Date invalide » —, `soiree.errJeuIntrouvable` et `soiree.errScoreInvalide` existent déjà : réutilisées telles quelles.)

- [ ] **Step 5: Étendre le PATCH de app/api/nights/[id]/route.ts**

Remplacer tout le fichier par :

```typescript
// app/api/nights/[id]/route.ts — PATCH : nuit en préparation { playerIds } (v1, QG) ;
// nuit terminée : correction partielle { playedAt?, gameId?, playerIds?, scores? } (v4.2.0).
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getNight, corrigerNuit, setNightPlayers, userCanAccessNight, type NuitPatch } from '@/lib/nights';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const nightId = Number((await params).id);
  const night = getNight(nightId);
  if (!night || !userCanAccessNight(user.id, nightId))
    return NextResponse.json({ error: t(lang, 'erreurs.soireeIntrouvable') }, { status: 404 });
  const body = await req.json();
  if (night.status !== 'termine') {
    // Comportement v1 conservé : le QG ne change que les joueurs d'une nuit en préparation.
    const { playerIds } = body;
    if (!Array.isArray(playerIds) || !playerIds.includes(user.id))
      return NextResponse.json({ error: t(lang, 'soiree.errDoitEtreDansSoiree') }, { status: 400 });
    setNightPlayers(nightId, playerIds);
    return NextResponse.json({ ok: true });
  }
  const patch: NuitPatch = {};
  if (body.playedAt !== undefined) patch.playedAt = body.playedAt;
  if (body.gameId !== undefined) patch.gameId = Number(body.gameId);
  if (body.playerIds !== undefined) patch.playerIds = body.playerIds.map(Number);
  if (body.scores !== undefined) patch.scores = body.scores;
  const res = corrigerNuit(nightId, user.id, patch, lang);
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Vérifier le passage**

Run: `npx vitest run tests/unit/nights-edit.test.ts tests/unit/nights.test.ts && npx tsc --noEmit`
Expected: PASS (nouveaux tests verts, nights.test.ts intact, tsc vert — clés des deux dicts complètes).

- [ ] **Step 7: Commit**

```bash
git add lib/nights.ts app/api/nights/[id]/route.ts lib/i18n/fr.ts lib/i18n/en.ts tests/unit/nights-edit.test.ts
git commit -m "feat(nights): corriger une partie terminée — date, jeu, participants, scores (v4.2.0)"
```

---

### Task 2: `supprimerNuit` + DELETE

**Files:**
- Modify: `lib/nights.ts` (ajouter `supprimerNuit` après `corrigerNuit`)
- Modify: `app/api/nights/[id]/route.ts` (ajouter le handler DELETE)
- Test: `tests/unit/nights-edit.test.ts` (ajouter le describe)

**Interfaces:**
- Produces: `supprimerNuit(nightId: number, userId: number, lang?: Lang): { ok: true } | NightStateError` — Task 4 (bouton UI) s'appuie dessus.

- [ ] **Step 1: Écrire les tests unitaires qui échouent**

Dans `tests/unit/nights-edit.test.ts`, ajouter `supprimerNuit` à l'import de `@/lib/nights` (l.5) et, après le describe `corrigerNuit` :

```typescript
describe('supprimerNuit', () => {
  it('créateur OU participant supprime ; un autre reçoit 404', () => {
    const n = nuitTerminee();
    expect(supprimerNuit(n.nightId, n.lea)).toEqual({ ok: true });
    const n2 = nuitTerminee();
    expect(supprimerNuit(n2.nightId, n2.autre).status).toBe(404);
    expect(getNight(n2.nightId)).not.toBeNull();
  });
  it('CASCADE : nuit avec picks → joueurs, scores, picks, verdicts tous partis', () => {
    const n = nuitTerminee();
    getDb().prepare('INSERT INTO picks (night_id, game_id, spinner_id) VALUES (?, ?, ?)').run(n.nightId, n.game, n.marc);
    poserVerdict(n.nightId, n.marc, 'bien');
    expect(supprimerNuit(n.nightId, n.marc)).toEqual({ ok: true });
    expect(getNight(n.nightId)).toBeNull();
    for (const table of ['night_players', 'night_scores', 'picks', 'night_verdicts'])
      expect(getDb().prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE night_id = ?`).get(n.nightId).c).toBe(0);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run tests/unit/nights-edit.test.ts`
Expected: FAIL — `supprimerNuit` n'est pas exportée.

- [ ] **Step 3: Implémenter**

Dans `lib/nights.ts`, après `corrigerNuit` :

```typescript
// v4.2.0 — supprimer une partie : créateur OU participant (choix client). Les tables
// liées partent en CASCADE (joueurs, jeux d'étagère, scores, picks, verdicts) —
// l'UI a demandé confirmation en listant ce qui disparaît (garde-fou AGENTS.md).
export function supprimerNuit(nightId: number, userId: number, lang: Lang = 'fr'): { ok: true } | NightStateError {
  const night = getNight(nightId);
  if (!night) return { error: t(lang, 'erreurs.soireeIntrouvable'), status: 404 };
  if (!userCanAccessNight(userId, nightId)) return { error: t(lang, 'erreurs.soireeIntrouvable'), status: 404 };
  getDb().prepare('DELETE FROM nights WHERE id = ?').run(nightId);
  return { ok: true };
}
```

Dans `app/api/nights/[id]/route.ts`, après le PATCH (importer `supprimerNuit` avec les autres) :

```typescript
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const nightId = Number((await params).id);
  const res = supprimerNuit(nightId, user.id, lang);
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Vérifier le passage**

Run: `npx vitest run tests/unit/nights-edit.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/nights.ts app/api/nights/[id]/route.ts tests/unit/nights-edit.test.ts
git commit -m "feat(nights): supprimer une partie — créateur ou participant, CASCADE complète (v4.2.0)"
```

---

### Task 3: `creerNuitRetro` + POST /api/nights/retro

**Files:**
- Modify: `lib/nights.ts` (ajouter `creerNuitRetro` après `supprimerNuit`)
- Create: `app/api/nights/retro/route.ts`
- Test: `tests/unit/nights-edit.test.ts` (ajouter le describe)

**Interfaces:**
- Produces: `creerNuitRetro(userId: number, entree: { playedAt: string; gameId: number; playerIds: number[]; scores?: Record<string, number> }, lang?: Lang): { ok: true; nightId: number } | NightStateError` — Task 5 (UI) s'appuie dessus ; la route répond `{ ok: true, nightId }`.

- [ ] **Step 1: Écrire les tests unitaires qui échouent**

Dans `tests/unit/nights-edit.test.ts`, ajouter `creerNuitRetro` à l'import de `@/lib/nights`, puis :

```typescript
describe('creerNuitRetro', () => {
  it('crée directement terminée : jeu posé, joueurs, scores, créateur = l\'auteur', () => {
    const marc = (registerUser(`e-r-marc-${Math.random().toString(36).slice(2, 8)}`, '1234') as { id: number }).id;
    const lea = (registerUser(`e-r-lea-${Math.random().toString(36).slice(2, 8)}`, '1234') as { id: number }).id;
    const game = createGame(marc, { title: 'Dune', box_format: 'grand' });
    const res = creerNuitRetro(marc, { playedAt: hier, gameId: game, playerIds: [lea], scores: { [marc]: 44, [lea]: 39 } });
    expect(res.ok).toBe(true);
    const night = getNight((res as { nightId: number }).nightId)!;
    expect(night.status).toBe('termine');
    expect(night.game_id).toBe(game);
    expect(night.creator_id).toBe(marc);
    expect(night.played_at).toBe(hier);
    expect(getNightPlayers(night.id).map((p) => p.id).sort()).toEqual([marc, lea].sort()); // créateur auto-ajouté
    expect(Object.fromEntries(getNightScores(night.id).map((s) => [s.user_id, s.score]))).toEqual({ [marc]: 44, [lea]: 39 });
  });
  it('date future rejetée (400) ; score d\'un absent rejeté (400) ; nuit hors stats d\'autrui', () => {
    const marc = (registerUser(`e-r2-${Math.random().toString(36).slice(2, 8)}`, '1234') as { id: number }).id;
    const game = createGame(marc, { title: 'Azul', box_format: 'petit' });
    expect(creerNuitRetro(marc, { playedAt: demain, gameId: game, playerIds: [marc] }).status).toBe(400);
    const res = creerNuitRetro(marc, { playedAt: hier, gameId: game, playerIds: [marc], scores: { [999999]: 5 } });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run tests/unit/nights-edit.test.ts`
Expected: FAIL — `creerNuitRetro` n'est pas exportée.

- [ ] **Step 3: Implémenter**

Dans `lib/nights.ts`, après `supprimerNuit` :

```typescript
// v4.2.0 — créer une partie passée en un geste : date passée + jeu + participants
// + scores optionnels, créée directement terminée avec le jeu posé. L'auteur en
// devient le créateur (auto-ajouté). Pour une partie à venir : le flux Planifier.
export function creerNuitRetro(userId: number, entree: { playedAt: string; gameId: number; playerIds: number[]; scores?: Record<string, number> }, lang: Lang = 'fr'): { ok: true; nightId: number } | NightStateError {
  const db = getDb();
  if (!datePasseeValide(entree.playedAt)) // helper posé en Task 1 — même validation
    return { error: t(lang, 'soiree.errDateInvalide'), status: 400 };
  if (!db.prepare('SELECT 1 FROM games WHERE id = ?').get(entree.gameId)) return { error: t(lang, 'soiree.errJeuIntrouvable'), status: 400 };
  const joueurs = [...new Set(entree.playerIds.includes(userId) ? entree.playerIds : [...entree.playerIds, userId])];
  for (const pid of joueurs)
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(pid)) return { error: t(lang, 'soiree.errJoueurIntrouvable'), status: 400 };
  const lignes: [number, number][] = [];
  if (entree.scores) {
    for (const [k, v] of Object.entries(entree.scores)) {
      const uid = Number(k);
      if (!joueurs.includes(uid) || !Number.isFinite(v)) return { error: t(lang, 'soiree.errScoreInvalide'), status: 400 };
      lignes.push([uid, v]);
    }
  }
  const info = db.prepare(`INSERT INTO nights (creator_id, played_at, game_id, status, ended_at) VALUES (?, ?, ?, 'termine', datetime('now','localtime'))`)
    .run(userId, entree.playedAt, entree.gameId);
  const nightId = Number(info.lastInsertRowid);
  const insP = db.prepare('INSERT OR IGNORE INTO night_players (night_id, user_id) VALUES (?, ?)');
  for (const id of joueurs) insP.run(nightId, id);
  const insS = db.prepare('INSERT OR REPLACE INTO night_scores (night_id, user_id, score) VALUES (?, ?, ?)');
  for (const [uid, v] of lignes) insS.run(nightId, uid, v);
  return { ok: true, nightId }; // pas de notifyNight : une partie du passé n'a personne en live
}
```

`app/api/nights/retro/route.ts` (nouveau) :

```typescript
// app/api/nights/retro/route.ts — POST : créer une partie passée en un geste (v4.2.0).
// Corps { playedAt, gameId, playerIds, scores? } — l'auteur devient créateur ;
// la partie naît directement 'termine' avec le jeu posé.
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { creerNuitRetro } from '@/lib/nights';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

export async function POST(req: Request) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const body = await req.json();
  const res = creerNuitRetro(user.id, {
    playedAt: body.playedAt,
    gameId: Number(body.gameId),
    playerIds: Array.isArray(body.playerIds) ? body.playerIds.map(Number) : [],
    scores: body.scores && typeof body.scores === 'object' ? body.scores : undefined,
  }, lang);
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true, nightId: res.nightId });
}
```

- [ ] **Step 4: Vérifier le passage**

Run: `npx vitest run tests/unit/nights-edit.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/nights.ts app/api/nights/retro/route.ts tests/unit/nights-edit.test.ts
git commit -m "feat(nights): créer une partie passée en un geste — POST /api/nights/retro (v4.2.0)"
```

---

### Task 4: UI de correction — `CorrigerPartie` + page de nuit (E2E)

**Files:**
- Create: `components/CorrigerPartie.tsx`
- Modify: `app/nights/[id]/page.tsx` (données + montage)
- Modify: `app/globals.css` (bloc de styles en fin de fichier)
- Modify: `lib/i18n/fr.ts` + `lib/i18n/en.ts` (20 clés)
- Test: `tests/e2e/corrections.spec.ts` (nouveau)

**Interfaces:**
- Consumes: `corrigerNuit` (T1, via PATCH), `supprimerNuit` (T2, via DELETE), `verdictsDeNuit(nightId): { adore; bien; neutre }` (existant), `getNightPlayers`, `getNightScores`, `getNightPicks`, `listUserLibrary`, `getFoyerForUser` (existants).
- Produces: hooks E2E stables — bouton `Corriger cette partie`, bouton `🗑️ Supprimer cette partie`, dialog aria-label `Supprimer cette partie ?`, bouton confirm `Supprimer` (exact), champs `Date de la partie` / `Jeu joué` / `Score de {pseudo}`.

- [ ] **Step 1: Écrire l'E2E qui échoue**

`tests/e2e/corrections.spec.ts` (idiome `verdict.spec.ts` : `monId` via `/api/me`, setup API) :

```typescript
import { test, expect, type Page } from '@playwright/test';
import { newGame, putOnShelf } from './helpers/shelf';

const hier = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE');
const demain = new Date(Date.now() + 86400000).toLocaleDateString('sv-SE');

async function register(page: Page, pseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const done = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await done;
  await page.waitForURL('/etagere');
}

async function monId(page: Page): Promise<number> {
  return ((await (await page.request.get('/api/me')).json()) as { id: number }).id;
}

/** Compte + jeu (helpers API), nuit via API, étagère, tirage, boîte, fin AVEC scores. */
async function partieTerminee(page: Page, pseudo: string, scores: Record<string, number> = {}): Promise<{ nightId: number; gameId: number }> {
  await register(page, pseudo);
  const gameId = await newGame(page, `Cascadia-${pseudo}`, 'grand');
  const { nightId } = await (await page.request.post('/api/nights', { data: { playerIds: [] } })).json() as { nightId: number };
  await putOnShelf(page, gameId, nightId);
  await page.request.post('/api/draw', { data: { nightId, gameIds: [gameId] } });
  await page.request.post(`/api/nights/${nightId}/box-out`, { data: { gameId } });
  // La route /end attend le wrapper { scores } — un record nu serait ignoré.
  await page.request.post(`/api/nights/${nightId}/end`, { data: { scores } });
  return { nightId, gameId };
}

test('corriger un score → le podium et la page se mettent à jour', async ({ page }) => {
  const s = Date.now().toString(36);
  const { nightId } = await partieTerminee(page, `cor-${s}`, { [(await monId(page))]: 78 });
  await page.goto(`/nights/${nightId}`);
  await page.getByRole('button', { name: 'Corriger cette partie' }).click();
  await page.getByLabel(`Score de ${`cor-${s}`}`).fill('82');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.pod1 .sc')).toContainText('82');
});

test('changer le jeu → alerte, puis verdicts réinitialisés (zéro)', async ({ page }) => {
  const s = Date.now().toString(36);
  const { nightId } = await partieTerminee(page, `ver-${s}`, { [(await monId(page))]: 20 });
  await newGame(page, `Everdell-${s}`, 'moyen'); // le second jeu à sélectionner
  await page.request.post(`/api/nights/${nightId}/verdict`, { data: { verdict: 'adore' } });
  await page.goto(`/nights/${nightId}`);
  await page.getByRole('button', { name: 'Corriger cette partie' }).click();
  await page.getByLabel('Jeu joué').selectOption({ label: `Everdell-${s}` });
  await expect(page.getByRole('alert')).toContainText('réinitialise les verdicts');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  // la modale de suppression sert de surface d'assertion : compteurs à zéro
  await page.getByRole('button', { name: '🗑️ Supprimer cette partie' }).click();
  await expect(page.getByRole('dialog')).toContainText('0 😍 · 0 🙂 · 0 😐');
  await page.getByRole('button', { name: 'Garder' }).click();
});

test('supprimer avec confirmation → redirection, nuit 404', async ({ page }) => {
  const s = Date.now().toString(36);
  const { nightId } = await partieTerminee(page, `sup-${s}`, { [(await monId(page))]: 55 });
  await page.goto(`/nights/${nightId}`);
  await page.getByRole('button', { name: '🗑️ Supprimer cette partie' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click();
  await page.waitForURL('**/nights');
  const res = await page.goto(`/nights/${nightId}`);
  expect(res!.status()).toBe(404);
});

test('non-membre : page 404 et API 404 (PATCH comme DELETE)', async ({ browser }) => {
  const s = Date.now().toString(36);
  const page = await (await browser.newContext()).newPage();
  const { nightId } = await partieTerminee(page, `nm-${s}`, {});
  const autre = await (await browser.newContext()).newPage();
  await register(autre, `nm-autre-${s}`);
  expect((await autre.goto(`/nights/${nightId}`))!.status()).toBe(404);
  const patch = await autre.request.patch(`/api/nights/${nightId}`, { data: { playedAt: hier } });
  expect(patch.status()).toBe(404);
  const del = await autre.request.delete(`/api/nights/${nightId}`);
  expect(del.status()).toBe(404);
});

test('date future → message d\'erreur affiché, rien n\'enregistré', async ({ page }) => {
  const s = Date.now().toString(36);
  const { nightId } = await partieTerminee(page, `df-${s}`, {});
  await page.goto(`/nights/${nightId}`);
  await page.getByRole('button', { name: 'Corriger cette partie' }).click();
  await page.getByLabel('Date de la partie').fill(demain);
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('alert')).toContainText('Date invalide'); // clé existante réutilisée
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx playwright test tests/e2e/corrections.spec.ts`
Expected: FAIL — le bouton « Corriger cette partie » n'existe pas (tous les tests).

- [ ] **Step 3: Ajouter les 20 clés aux deux dicts**

`lib/i18n/fr.ts` (nouveau bloc après les erreurs `soiree.err*`) :

```typescript
  // v4.2.0 — corriger / supprimer une partie terminée (maquette onglets 1 et 4).
  'corriger.titre': 'Corriger cette partie',
  'corriger.alerteJeu': 'Changer de jeu réinitialise les verdicts 😍🙂😐 de cette partie — ils jugaient l'ancienne boîte.', // apostrophes typographiques
  'corriger.date': 'Date de la partie',
  'corriger.jeu': 'Jeu joué',
  'corriger.participants': 'Participants',
  'corriger.ajouter': '＋ Ajouter',
  'corriger.scores': 'Scores',
  'corriger.scoreDe': ({ pseudo }: Record<string, string | number>) => `Score de ${pseudo}`,
  'corriger.enregistrer': 'Enregistrer',
  'corriger.supprimer': '🗑️ Supprimer cette partie',
  'corriger.modaleTitre': 'Supprimer cette partie ?',
  'corriger.modaleIntro': 'Cette action est définitive. Disparaîtront :',
  'corriger.modaleScores': ({ detail }: Record<string, string | number>) => `les scores (${detail})`,
  'corriger.modaleVerdicts': ({ detail }: Record<string, string | number>) => `les verdicts 😍🙂😐 (${detail})`,
  'corriger.modaleTirage': ({ detail }: Record<string, string | number>) => `l'historique de tirage (${detail} tirages)`, // apostrophe typographique
  'corriger.modaleStats': 'Les stats de profils se mettront à jour.',
  'corriger.garder': 'Garder',
  'corriger.confirmerSupprimer': 'Supprimer',
  'corriger.droits': 'Le créateur et les participants peuvent corriger ou supprimer.',
```

`lib/i18n/en.ts` (même emplacement) :

```typescript
  // v4.2.0 — correct / delete a finished game (mockup tabs 1 and 4).
  'corriger.titre': 'Correct this game',
  'corriger.alerteJeu': 'Changing the game resets this game’s 😍🙂😐 verdicts — they were about the original box.',
  'corriger.date': 'Game date',
  'corriger.jeu': 'Game played',
  'corriger.participants': 'Players',
  'corriger.ajouter': '＋ Add',
  'corriger.scores': 'Scores',
  'corriger.scoreDe': ({ pseudo }: Record<string, string | number>) => `${pseudo}’s score`,
  'corriger.enregistrer': 'Save',
  'corriger.supprimer': '🗑️ Delete this game',
  'corriger.modaleTitre': 'Delete this game?',
  'corriger.modaleIntro': 'This is permanent. It will remove:',
  'corriger.modaleScores': ({ detail }: Record<string, string | number>) => `the scores (${detail})`,
  'corriger.modaleVerdicts': ({ detail }: Record<string, string | number>) => `the 😍🙂😐 verdicts (${detail})`,
  'corriger.modaleTirage': ({ detail }: Record<string, string | number>) => `the draw history (${detail} draws)`,
  'corriger.modaleStats': 'Profile stats will update accordingly.',
  'corriger.garder': 'Keep it',
  'corriger.confirmerSupprimer': 'Delete',
  'corriger.droits': 'The creator and the players can correct or delete.',
```

(20 clés au total, dont `scoreDe` fonctionnelle — l'ancien décompte « 17 » valait pour les seuls libellés propres.)

- [ ] **Step 4: Écrire components/CorrigerPartie.tsx**

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Game, UserLite } from '@/lib/types';
import { useI18n } from './LanguageProvider';

type LigneScore = { user_id: number; pseudo: string; score: number | null };
type Compteurs = { adore: number; bien: number; neutre: number };

// v4.2.0 — bloc « Corriger cette partie » de la page d'une partie terminée :
// date, jeu (alerte verdicts au changement), participants, scores ; bouton
// rouge « Supprimer » avec modale qui liste ce qui disparaît (maquette onglets 1 et 4).
export default function CorrigerPartie({ nightId, playedAt, gameId, titreJeu, joueurs, candidats, scores, jeux, compteurs, nbTirages }: {
  nightId: number;
  playedAt: string;
  gameId: number | null;
  titreJeu: string | null;
  joueurs: UserLite[];
  candidats: UserLite[];
  scores: LigneScore[];
  jeux: Game[];
  compteurs: Compteurs;
  nbTirages: number;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [date, setDate] = useState(playedAt);
  const [jeu, setJeu] = useState<number | null>(gameId ?? jeux[0]?.id ?? null); // partie sans jeu : la 1ʳᵉ boîte est présélectionnée
  const [presents, setPresents] = useState<number[]>(joueurs.map((j) => j.id));
  const [valeurs, setValeurs] = useState<Record<number, string>>(
    Object.fromEntries(joueurs.map((j) => [j.id, String(scores.find((s) => s.user_id === j.id)?.score ?? '')])));
  const [err, setErr] = useState<string | null>(null);
  const [modale, setModale] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const jeuChange = jeu !== gameId;
  const basculer = (id: number) => setPresents((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function enregistrer() {
    setOccupe(true); setErr(null);
    const res = await fetch(`/api/nights/${nightId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playedAt: date, gameId: jeu, playerIds: presents,
        scores: Object.fromEntries(Object.entries(valeurs).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])),
      }),
    });
    setOccupe(false);
    if (!res.ok) { setErr((await res.json()).error ?? t('erreurs.impossible')); return; }
    setOuvert(false);
    router.refresh();
  }

  async function supprimer() {
    setOccupe(true); setErr(null);
    const res = await fetch(`/api/nights/${nightId}`, { method: 'DELETE' });
    setOccupe(false);
    if (!res.ok) { setErr((await res.json()).error ?? t('erreurs.impossible')); setModale(false); return; }
    router.push('/nights');
    router.refresh();
  }

  const detailScores = scores.filter((s) => s.score !== null).map((s) => `${s.pseudo} ${s.score}`).join(' · ') || '—';
  const detailVerdicts = `${compteurs.adore} 😍 · ${compteurs.bien} 🙂 · ${compteurs.neutre} 😐`;
  const presentsLignes = presents.map((id) => {
    const j = joueurs.find((x) => x.id === id) ?? candidats.find((x) => x.id === id)!;
    return (
      <div className="corriger-score" key={id}>
        <span>{j.pseudo}</span>
        <input aria-label={t('corriger.scoreDe', { pseudo: j.pseudo })} inputMode="numeric"
          value={valeurs[id] ?? ''} onChange={(e) => setValeurs((v) => ({ ...v, [id]: e.target.value }))} />
      </div>
    );
  });
  const hors = candidats.filter((c) => !presents.includes(c.id));

  return (
    <>
      <div className="corriger-bloc">
        <button type="button" className="corriger-toggle" aria-expanded={ouvert}
          onClick={() => setOuvert((o) => !o)}>
          {t('corriger.titre')} {ouvert ? '▴' : '▾'}
        </button>
        {ouvert && (
          <div className="corriger-form">
            {jeuChange && <p className="corriger-alerte" role="alert">{t('corriger.alerteJeu')}</p>}
            {err && <p className="corriger-err" role="alert">{err}</p>}
            <label className="corriger-champ">{t('corriger.date')}
              <input type="date" value={date} max={new Date().toLocaleDateString('sv-SE')}
                onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="corriger-champ">{t('corriger.jeu')}
              <select value={jeu ?? ''} onChange={(e) => setJeu(Number(e.target.value))}>
                {gameId !== null && !jeux.some((g) => g.id === gameId) && <option value={gameId}>{titreJeu}</option>}
                {jeux.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
              </select>
            </label>
            <div className="corriger-champ">
              <span>{t('corriger.participants')}</span>
              <div className="corriger-chips">
                {presents.map((id) => (
                  <button type="button" key={id} className="corriger-chip" onClick={() => basculer(id)}>
                    {(joueurs.find((x) => x.id === id) ?? candidats.find((x) => x.id === id))!.pseudo} ✕
                  </button>
                ))}
                {hors.map((c) => (
                  <button type="button" key={c.id} className="corriger-chip hors" onClick={() => basculer(c.id)}>
                    {t('corriger.ajouter')} · {c.pseudo}
                  </button>
                ))}
              </div>
            </div>
            <div className="corriger-champ">
              <span>{t('corriger.scores')}</span>
              {presentsLignes}
            </div>
            <button type="button" className="btn-cuivre" disabled={occupe} onClick={enregistrer}>{t('corriger.enregistrer')}</button>
          </div>
        )}
      </div>
      <button type="button" className="btn-rouge" onClick={() => setModale(true)}>{t('corriger.supprimer')}</button>
      <p className="corriger-note">{t('corriger.droits')}</p>
      {modale && (
        <div className="corriger-voile" role="dialog" aria-label={t('corriger.modaleTitre')}>
          <div className="corriger-modale">
            <h3>{t('corriger.modaleTitre')}</h3>
            <p>{t('corriger.modaleIntro')}</p>
            <ul>
              <li>{t('corriger.modaleScores', { detail: detailScores })}</li>
              <li>{t('corriger.modaleVerdicts', { detail: detailVerdicts })}</li>
              <li>{t('corriger.modaleTirage', { detail: nbTirages })}</li>
            </ul>
            <p>{t('corriger.modaleStats')}</p>
            <div className="corriger-actions">
              <button type="button" onClick={() => setModale(false)}>{t('corriger.garder')}</button>
              <button type="button" className="btn-rouge corriger-confirmer" disabled={occupe} onClick={supprimer}>{t('corriger.confirmerSupprimer')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 5: Monter le bloc dans app/nights/[id]/page.tsx + CSS**

Imports à ajouter :

```typescript
import CorrigerPartie from '@/components/CorrigerPartie';
import { getNightPlayers, getNightPicks } from '@/lib/nights'; // étendre l'import existant de '@/lib/nights'
import { listUserLibrary, getGame } from '@/lib/games'; // import nouveau : la page n'importait pas de lib/games
import { getFoyerForUser } from '@/lib/foyers';
```

Dans le corps du composant, après `const scores = getNightScores(night.id);` :

```typescript
  const joueurs = getNightPlayers(night.id);
  const nbTirages = getNightPicks(night.id).length;
  const jeux = listUserLibrary(user.id);
  if (night.game_id && !jeux.some((g) => g.id === night.game_id)) {
    const jeuActuel = getGame(night.game_id);
    if (jeuActuel) jeux.push(jeuActuel);
  }
  const membres = getFoyerForUser(user.id)?.members ?? [];
```

Juste avant `<PartagerResultats … />` :

```typescript
      {night.status === 'termine' && (
        <CorrigerPartie nightId={night.id} playedAt={night.played_at} gameId={night.game_id ?? null}
          titreJeu={game?.title ?? null} joueurs={joueurs} candidats={membres} scores={scores} jeux={jeux}
          compteurs={verdictsDeNuit(night.id)} nbTirages={nbTirages} />
      )}
```

(`verdictsDeNuit` est déjà importé dans la page.) CSS à ajouter à `app/globals.css` :

```css
/* v4.2.0 — corriger / supprimer une partie (maquette onglets 1 et 4) */
.corriger-bloc { background: var(--surface); border: 1px solid color-mix(in srgb, var(--doux) 30%, transparent); border-radius: 16px; padding: 14px; margin-top: 14px; }
.corriger-toggle { width: 100%; text-align: left; background: none; border: none; color: var(--cuivre); font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer; padding: 0; }
.corriger-form { display: flex; flex-direction: column; gap: 12px; margin-top: 12px; }
.corriger-alerte, .corriger-err { font-size: 12.5px; line-height: 1.45; border-radius: 12px; padding: 10px 12px; margin: 0; }
.corriger-alerte { background: color-mix(in srgb, var(--ambre) 12%, transparent); border: 1px solid color-mix(in srgb, var(--ambre) 45%, transparent); color: #EAD9A8; }
.corriger-err { background: color-mix(in srgb, var(--rouge) 12%, transparent); border: 1px solid color-mix(in srgb, var(--rouge) 45%, transparent); color: #F2C7BB; }
.corriger-champ { display: flex; flex-direction: column; gap: 6px; font-size: 12px; font-weight: 600; color: var(--doux-clair); }
.corriger-champ input, .corriger-champ select { font-family: inherit; font-size: 14px; color: var(--creme); background: var(--noyer); border: 1px solid color-mix(in srgb, var(--doux) 40%, transparent); border-radius: 10px; padding: 10px 12px; }
.corriger-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.corriger-chip { display: inline-flex; align-items: center; gap: 6px; background: var(--surface-plus); color: var(--creme); border-radius: 999px; padding: 5px 10px; font-size: 12.5px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; }
.corriger-chip.hors { background: transparent; border: 1px dashed color-mix(in srgb, var(--doux) 55%, transparent); color: var(--doux-clair); }
.corriger-score { display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 600; }
.corriger-score input { width: 84px; text-align: center; font-family: inherit; font-size: 15px; font-weight: 700; color: var(--creme); background: var(--noyer); border: 1px solid color-mix(in srgb, var(--doux) 40%, transparent); border-radius: 10px; padding: 8px 6px; }
.btn-cuivre { width: 100%; background: var(--cuivre); color: var(--noyer); font-family: inherit; font-size: 14px; font-weight: 700; border: none; border-radius: 12px; padding: 11px 16px; cursor: pointer; }
.btn-rouge { width: 100%; margin-top: 12px; background: color-mix(in srgb, var(--rouge) 18%, transparent); color: #F2B7A6; border: 1px solid color-mix(in srgb, var(--rouge) 55%, transparent); font-family: inherit; font-size: 14px; font-weight: 700; border-radius: 12px; padding: 11px 16px; cursor: pointer; }
.corriger-note { text-align: center; font-size: 12px; color: var(--doux); margin-top: 8px; }
.corriger-voile { position: fixed; inset: 0; background: rgba(20,13,8,.72); display: grid; place-items: center; padding: 24px; z-index: 60; }
.corriger-modale { background: var(--surface); border: 1px solid color-mix(in srgb, var(--doux) 35%, transparent); border-radius: 18px; padding: 18px; width: min(420px, 100%); color: var(--creme); }
.corriger-modale h3 { font-size: 17px; font-weight: 800; margin: 0 0 8px; }
.corriger-modale ul { margin: 10px 0 12px; padding-left: 18px; font-size: 13px; line-height: 1.7; color: var(--doux-clair); }
.corriger-actions { display: flex; gap: 8px; }
.corriger-actions button { flex: 1; font-family: inherit; font-weight: 700; font-size: 14px; border-radius: 12px; padding: 11px 16px; cursor: pointer; background: transparent; color: var(--doux-clair); border: 1px solid color-mix(in srgb, var(--doux) 45%, transparent); }
.corriger-actions .btn-rouge { margin-top: 0; width: auto; }
```

- [ ] **Step 6: Vérifier le passage**

Run: `npx playwright test tests/e2e/corrections.spec.ts && npx tsc --noEmit && npx vitest run`
Expected: PASS (5 tests E2E verts, tsc vert, 167+ unitaires verts).

- [ ] **Step 7: Commit**

```bash
git add components/CorrigerPartie.tsx app/nights/[id]/page.tsx app/globals.css lib/i18n/fr.ts lib/i18n/en.ts tests/e2e/corrections.spec.ts
git commit -m "feat(ui): bloc « Corriger cette partie » + suppression confirmée sur la page de partie (v4.2.0)"
```

---

### Task 5: Créer une partie passée + Mes parties (entrée, pastille, getMyParties)

**Files:**
- Create: `components/CreerPartiePassee.tsx`
- Modify: `components/ProfileClient.tsx` (props + entrée + pastille)
- Modify: `app/profil/page.tsx` (nouvelles props)
- Modify: `lib/users.ts` (`getMyParties` : LEFT JOIN + `a_scores` + filtre participant)
- Modify: `lib/i18n/fr.ts` + `lib/i18n/en.ts` (7 clés)
- Test: `tests/e2e/corrections.spec.ts` (ajouter 2 tests)

**Interfaces:**
- Consumes: `creerNuitRetro` (T3, via POST /api/nights/retro), `listUserLibrary`, `getFoyerForUser().members` (existants).
- Produces: `getMyParties` renvoie `{ …, a_scores: number }` (0/1) — ProfileClient lit `p.a_scores` ; hooks : bouton `＋ Créer une partie passée`, bouton `Créer la partie`, pastille `Scores à saisir`.

- [ ] **Step 1: Écrire les tests unitaires + E2E qui échouent**

Unit — dans `tests/unit/nights-edit.test.ts` :

```typescript
describe('getMyParties (v4.2.0)', () => {
  it('liste les parties sans scores (pastille) et cache celles des autres', async () => {
    const { getMyParties } = await import('@/lib/users');
    const marc = (registerUser(`e-mp-${Math.random().toString(36).slice(2, 8)}`, '1234') as { id: number }).id;
    const autre = (registerUser(`e-mp2-${Math.random().toString(36).slice(2, 8)}`, '1234') as { id: number }).id;
    const game = createGame(marc, { title: 'Harmonies', box_format: 'petit' });
    const sansScores = creerNuitRetro(marc, { playedAt: hier, gameId: game, playerIds: [marc] });
    const avecScores = creerNuitRetro(marc, { playedAt: hier, gameId: game, playerIds: [marc], scores: { [marc]: 10 } });
    const dAutre = creerNuitRetro(autre, { playedAt: hier, gameId: game, playerIds: [autre] }); // pas à marc
    const lignes = getMyParties(marc, 10);
    const parId = Object.fromEntries(lignes.map((l) => [l.id, l]));
    expect(parId[(sansScores as { nightId: number }).nightId].a_scores).toBe(0);
    expect(parId[(avecScores as { nightId: number }).nightId].a_scores).toBe(1);
    expect(lignes.some((l) => l.id === (dAutre as { nightId: number }).nightId)).toBe(false);
  });
});
```

E2E — dans `tests/e2e/corrections.spec.ts` :

```typescript
test('créer une partie passée en un geste → page terminée, Mes parties, stats', async ({ page }) => {
  const s = Date.now().toString(36);
  await register(page, `retro-${s}`);
  const gameId = await newGame(page, `Everdell-${s}`, 'moyen');
  await page.goto('/profil');
  await page.getByRole('button', { name: '＋ Créer une partie passée' }).click();
  await page.getByLabel('Date de la partie').fill(hier);
  await page.getByLabel('Jeu joué').selectOption(String(gameId));
  await page.getByLabel(`Score de retro-${s}`).fill('63');
  await page.getByRole('button', { name: 'Créer la partie' }).click();
  await page.waitForURL('**/nights/**');
  await expect(page.locator('.badge-etat.b-term')).toBeVisible(); // badge « Terminée »
  await expect(page.locator('.pod1')).toContainText('63');
  await page.goto('/profil');
  await expect(page.locator('.mes-parties .mp-row').first()).toContainText(`Everdell-${s}`);
  await expect(page.locator('.mp-pastille')).toHaveCount(0); // les scores sont là
});

test('partie terminée sans scores → pastille « Scores à saisir » dans Mes parties', async ({ page }) => {
  const s = Date.now().toString(36);
  const { nightId } = await partieTerminee(page, `ps-${s}`, {}); // terminée SANS scores
  await page.goto('/profil');
  const ligne = page.locator('.mes-parties .mp-row', { hasText: `Cascadia-ps-${s}` });
  await expect(ligne).toContainText('Scores à saisir');
  // correction depuis la page : la pastille disparaît
  await page.goto(`/nights/${nightId}`);
  await page.getByRole('button', { name: 'Corriger cette partie' }).click();
  await page.getByLabel(`Score de ps-${s}`).fill('30');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.goto('/profil');
  await expect(page.locator('.mp-pastille')).toHaveCount(0);
});

test('date de demain au formulaire rétro → erreur affichée', async ({ page }) => {
  const s = Date.now().toString(36);
  await register(page, `rd-${s}`);
  const gameId = await newGame(page, `Azul-rd-${s}`, 'petit');
  await page.goto('/profil');
  await page.getByRole('button', { name: '＋ Créer une partie passée' }).click();
  await page.getByLabel('Date de la partie').fill(demain);
  await page.getByLabel('Jeu joué').selectOption(String(gameId));
  await page.getByRole('button', { name: 'Créer la partie' }).click();
  await expect(page.getByRole('alert')).toContainText('Date invalide');
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run tests/unit/nights-edit.test.ts && npx playwright test tests/e2e/corrections.spec.ts -g "partie passée|sans scores|demain"`
Expected: FAIL — `a_scores` inexistant, bouton/pastille absents.

- [ ] **Step 3: Ajouter les 7 clés aux deux dicts**

`lib/i18n/fr.ts` :

```typescript
  // v4.2.0 — créer une partie passée (maquette onglet 3) + Mes parties.
  'parties.creerPassee': '＋ Créer une partie passée',
  'parties.creerPasseeIntro': 'On a joué sans l'app ? Note tout d'un coup — la partie arrivera dans les stats de tout le monde.', // apostrophes typographiques
  'parties.alerteDate': 'La date doit être passée ou aujourd'hui — pour une partie à venir, passe par « Planifier ».', // apostrophe typographique
  'parties.creerBouton': 'Créer la partie',
  'parties.pastilleScores': 'Scores à saisir',
```

`lib/i18n/en.ts` :

```typescript
  // v4.2.0 — add a past game (mockup tab 3) + my games.
  'parties.creerPassee': '＋ Add a past game',
  'parties.creerPasseeIntro': 'Played without the app? Log it in one go — it lands in everyone’s stats.',
  'parties.alerteDate': 'The date must be in the past or today — for an upcoming game, use the planner.',
  'parties.creerBouton': 'Create the game',
  'parties.pastilleScores': 'Scores to enter',
```

- [ ] **Step 4: getMyParties — LEFT JOIN + a_scores + filtre participant (lib/users.ts)**

Remplacer la fonction (l.48-58) par :

```typescript
export function getMyParties(userId: number, limit = 6) {
  // v4.2.0 : les parties terminées SANS scores apparaissent (a_scores=0, pastille
  // « Scores à saisir »). Le filtre créateur/participant remplace celui qu'imposait
  // l'ancien INNER JOIN night_scores — sans lui, les nuits d'autrui fuiraient.
  return getDb().prepare(`
    SELECT n.id, n.played_at, g.title AS game_title, g.cover_path, g.cover_url, ns.score, nv.verdict AS mon_verdict,
      EXISTS(SELECT 1 FROM night_scores x WHERE x.night_id = n.id) AS a_scores
    FROM nights n
    LEFT JOIN night_scores ns ON ns.night_id = n.id AND ns.user_id = ?
    LEFT JOIN games g ON g.id = n.game_id
    LEFT JOIN night_verdicts nv ON nv.night_id = n.id AND nv.user_id = ?
    WHERE n.status = 'termine' AND (n.creator_id = ? OR EXISTS (SELECT 1 FROM night_players np WHERE np.night_id = n.id AND np.user_id = ?))
    ORDER BY n.played_at DESC, n.id DESC LIMIT ?`)
    .all(userId, userId, userId, userId, limit) as { id: number; played_at: string; game_title: string | null; cover_path: string | null; cover_url: string | null; score: number | null; mon_verdict: Verdict | null; a_scores: number }[];
}
```

- [ ] **Step 5: components/CreerPartiePassee.tsx (nouveau)**

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Game, UserLite } from '@/lib/types';
import { useI18n } from './LanguageProvider';

// v4.2.0 — formulaire « Créer une partie passée » (maquette onglet 3) :
// date passée + jeu + participants + scores optionnels, un seul geste.
export default function CreerPartiePassee({ jeux, joueurs, moiId }: { jeux: Game[]; joueurs: UserLite[]; moiId: number }) {
  const { t } = useI18n();
  const router = useRouter();
  const hier = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE');
  const [date, setDate] = useState(hier);
  const [jeu, setJeu] = useState<number | ''>('');
  const [presents, setPresents] = useState<number[]>([moiId]);
  const [valeurs, setValeurs] = useState<Record<number, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const basculer = (id: number) => setPresents((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function creer() {
    setOccupe(true); setErr(null);
    const res = await fetch('/api/nights/retro', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playedAt: date, gameId: jeu, playerIds: presents,
        scores: Object.fromEntries(Object.entries(valeurs).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])),
      }),
    });
    setOccupe(false);
    if (!res.ok) { setErr((await res.json()).error ?? t('erreurs.impossible')); return; }
    const { nightId } = await res.json();
    router.push(`/nights/${nightId}`);
    router.refresh();
  }

  return (
    <div className="cp-form">
      <p className="corriger-note" style={{ margin: 0, textAlign: 'left' }}>{t('parties.creerPasseeIntro')}</p>
      {err && <p className="corriger-err" role="alert">{err}</p>}
      <label className="corriger-champ">{t('corriger.date')}
        <input type="date" value={date} max={new Date().toLocaleDateString('sv-SE')} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="corriger-champ">{t('corriger.jeu')}
        <select value={jeu} onChange={(e) => setJeu(Number(e.target.value))}>
          <option value="" disabled>—</option>
          {jeux.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
        </select>
      </label>
      <div className="corriger-champ">
        <span>{t('corriger.participants')}</span>
        <div className="corriger-chips">
          {joueurs.map((j) => (
            <button type="button" key={j.id} className={'corriger-chip' + (presents.includes(j.id) ? '' : ' hors')} onClick={() => basculer(j.id)}>
              {presents.includes(j.id) ? `${j.pseudo} ✕` : `${t('corriger.ajouter')} · ${j.pseudo}`}
            </button>
          ))}
        </div>
      </div>
      <div className="corriger-champ">
        <span>{t('corriger.scores')}</span>
        {presents.map((id) => {
          const j = joueurs.find((x) => x.id === id)!;
          return (
            <div className="corriger-score" key={id}>
              <span>{j.pseudo}</span>
              <input aria-label={t('corriger.scoreDe', { pseudo: j.pseudo })} inputMode="numeric" placeholder="—"
                value={valeurs[id] ?? ''} onChange={(e) => setValeurs((v) => ({ ...v, [id]: e.target.value }))} />
            </div>
          );
        })}
      </div>
      <p className="corriger-alerte">{t('parties.alerteDate')}</p>
      <button type="button" className="btn-cuivre" disabled={occupe || jeu === ''} onClick={creer}>{t('parties.creerBouton')}</button>
    </div>
  );
}
```

- [ ] **Step 6: Intégrer dans ProfileClient + app/profil/page.tsx + CSS**

`app/profil/page.tsx` — imports + props :

```typescript
import { listUserLibrary } from '@/lib/games';
import { getFoyerForUser } from '@/lib/foyers'; // étendre l'import existant
```

```typescript
        parties={parties}
        jeux={listUserLibrary(user.id)}
        membres={getFoyerForUser(user.id)?.members ?? []}
```

`components/ProfileClient.tsx` — ajouter aux props (`jeux: Game[]`, `membres: UserLite[]`), l'état `const [creerOuvert, setCreerOuvert] = useState(false);`, l'import `CreerPartiePassee`, puis au-dessus de la liste :

```tsx
      <p className="pod-lb">{t('profil.mesParties')}</p>
      <button type="button" className="cp-creer" onClick={() => setCreerOuvert((o) => !o)}>{t('parties.creerPassee')}</button>
      {creerOuvert && <CreerPartiePassee jeux={jeux} joueurs={membres} moiId={me.id} />}
```

Et dans chaque ligne de la liste, après le span verdict :

```tsx
                {!p.a_scores && <span className="mp-pastille">{t('parties.pastilleScores')}</span>}
```

CSS (globals.css) :

```css
/* v4.2.0 — créer une partie passée + Mes parties */
.cp-creer { background: none; border: none; color: var(--cuivre); font-family: inherit; font-size: 13px; font-weight: 700; cursor: pointer; padding: 0; margin-bottom: 10px; }
.cp-form { background: var(--surface); border: 1px solid color-mix(in srgb, var(--doux) 30%, transparent); border-radius: 16px; padding: 14px; margin: 10px 0 14px; display: flex; flex-direction: column; gap: 12px; }
.mp-pastille { display: inline-block; width: fit-content; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 999px; background: color-mix(in srgb, var(--ambre) 18%, transparent); color: #EAD9A8; }
```

- [ ] **Step 7: Vérifier le passage**

Run: `npx vitest run && npx playwright test tests/e2e/corrections.spec.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add components/CreerPartiePassee.tsx components/ProfileClient.tsx app/profil/page.tsx lib/users.ts lib/i18n/fr.ts lib/i18n/en.ts app/globals.css tests/unit/nights-edit.test.ts tests/e2e/corrections.spec.ts
git commit -m "feat(ui): créer une partie passée en un geste + pastille « Scores à saisir » (v4.2.0)"
```

---

### Task 6: Version 4.2.0, CHANGELOG, suite verte complète

**Files:**
- Modify: `package.json` (`"version": "4.1.0"` → `"4.2.0"`)
- Modify: `CHANGELOG.md` (entrée en tête)
- Test: suite complète

- [ ] **Step 1: Bumper la version + CHANGELOG**

`package.json` : `"version": "4.2.0"`. En tête de `CHANGELOG.md` :

```markdown
## [4.2.0] — 2026-10-04

### Ajouté
- **Corriger une partie** — sur la page d'une partie terminée, le créateur et les
  participants peuvent changer le jeu (les verdicts 😍🙂😐 sont réinitialisés, avec
  alerte), la date, les participants et les scores ; les stats de profils suivent.
- **Supprimer une partie** — confirmation qui liste exactement ce qui disparaît
  (scores, verdicts, historique de tirage) ; les tables liées partent en cascade.
- **Créer une partie passée** — depuis Mes parties, un seul geste : date passée,
  jeu, participants, scores optionnels. Pour les parties jouées sans l'app.
- Pastille « Scores à saisir » dans Mes parties pour les parties terminées sans scores.
```

- [ ] **Step 2: Suite verte complète**

Run: `npx vitest run && npx playwright test && npx tsc --noEmit`
Expected: 100 % PASS (unit + E2E FR/EN + types).

- [ ] **Step 3: Commit**

```bash
git add package.json CHANGELOG.md
git commit -m "chore(release): v4.2.0 — corriger, supprimer et créer en retard les parties"
```

---

## Protocole de release (après le plan, hors tâches)

1. Worktree dédié + branche `feat/parties-corrections` (skill using-git-worktrees).
2. Tasks 1→6, commits atomiques.
3. PR → CI verte (4 jobs) → fusion **vérifiée via API** (le CLI `gh` a menti au passé : toujours contre-vérifier côté git/API) → déploiement VPS → tag annoté `v4.2.0` → workflow Release → vérif prod `curl -s https://etagere.marc-suarez.fr/sw.js | grep -o "wsp-v[0-9.]*"` → `wsp-v4.2.0`.
