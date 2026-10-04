# Verdict du jeu 😍🙂😐 — Plan d'implémentation (v3.7.0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Après la soirée terminée, chaque joueur connecté donne un verdict 😍🙂😐 sur la boîte jouée ; les compteurs s'affichent en direct, ça alimente les stats (profil, fiche jeu) et pèse doucement sur le tirage (×1,08 max / ×0,98 min).

**Architecture:** Table `night_verdicts` (jumeau de `game_votes` v3.5), lib pure `lib/verdicts.ts` (UPSERT révocable + agrégats + poids), route `POST /api/nights/[id]/verdict` fine, bloc client `VerdictBloc` sur la page détail (server component) avec `UserSync` pour le live, échantillonnage pondéré dans `lib/draw.ts` appelé par `app/api/draw`.

**Tech Stack:** Next.js App Router (server components + client components), better-sqlite3, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-04-verdict-du-jeu-design.md` (lire aussi la maquette validée : `.superpowers/brainstorm/24329-1791114664/content/maquette-v37-verdict.html`)

## Global Constraints

- UI 100 % français (toute nouvelle chaîne en français).
- Garde-fou chiffré (backlog, arbitré 2026-10-04) : max ×1,08 pour 😍-dominant, min ×0,98 pour 😐-dominant, ×1,00 sinon — écart relatif max ≈ ×1,10. **Jamais** au-delà.
- Révocable : revoter **remplace** (UNIQUE(night_id, user_id)).
- Confidentialité : compteurs de groupe seulement, **jamais** qui a voté quoi.
- Le poids n'influence que `pickGameId` au tirage — l'animation de la roue et le « jeu pressenti » ne changent pas.
- Une donnée n'est jamais détruite implicitement ; suppressions explicites uniquement.
- Suite verte avant commit final : `npx vitest run`, `npx tsc --noEmit`, `npx playwright test` (tests concernés au minimum).

## Review Focus

1. **Une nuit relancée puis re-terminée** — le verdict reste valable tant que `nights.game_id` est la boîte ; attendu : l'UPSERT met à jour `game_id` avec la valeur courante de `nights.game_id` (pas de verdict orphelin vers une ancienne boîte). → testé T1.
2. **Verdict posé alors que la nuit repasse « en_jeu » (relance)** — attendu : refus 409, rien d'écrit. → testé T1/T3.
3. **Joueur du foyer qui n'était PAS dans la nuit** — attendu : 403 (garde `isNightParticipant`, pas `userCanAccessNight`). → testé T3.
4. **Poids avec beaucoup de 😐 et peu de verdicts** — attendu : jamais sous ×0,98 ni au-dessus de ×1,08, quel que soit n. → testé T2.
5. **Compteurs avec un vote en cours de modification par un autre joueur** — le refresh live (`UserSync` absent aujourd'hui de la page détail) doit afficher les compteurs à jour sans double comptage. → testé T4 (E2E 2 joueurs).

---

### Task 1: Table `night_verdicts` + `lib/verdicts.ts` (écriture)

**Files:**
- Modify: `lib/db.ts` (constante `SCHEMA`, à côté de `game_votes` lignes 70-78)
- Create: `lib/verdicts.ts`
- Test: `tests/unit/verdicts.test.ts` (create), `tests/unit/db.test.ts` (extend)

**Interfaces:**
- Consumes: `getDb()` (lib/db.ts), `getNight(nightId)` → `Night & { game_id }` (lib/nights.ts:37), `isNightParticipant(nightId, userId)` (lib/nights.ts:244), `notifyNight` (privé lib/nights.ts:23 — **l'exporter** ou dupliquer l'émission : voir étape 3)
- Produces: `type Verdict = 'adore' | 'bien' | 'neutre'` ; `poserVerdict(nightId: number, userId: number, verdict: Verdict): NightGameResult` ; `verdictsDeNuit(nightId: number): { adore: number; bien: number; neutre: number }` ; `monVerdict(nightId: number, userId: number): Verdict | null` ; `export type NightGameResult` réutilisé de lib/nights.ts

- [ ] **Step 1: Écrire le test de table (échoue)**

Dans `tests/unit/db.test.ts`, ajouter à côté du bloc `game_votes` (l.54-75) :

```ts
it('night_verdicts : UNIQUE par (nuit, joueur) et CASCADE sur la nuit', () => {
  const marc = registerUser(`db-v-${Date.now().toString(36)}`, '1234');
  const nuit = createNight(marc.id, `Soirée verdict ${marc.id}`);
  const jeu = createGame(marc.id, { title: 'Cascadia', box_format: 'moyen' });
  boxOutNight(nuit.id, jeu.id, marc.id);
  endNight(nuit.id, marc.id, [{ user_id: marc.id, score: 10 }]);
  poserVerdict(nuit.id, marc.id, 'adore');
  expect(() => poserVerdict(nuit.id, marc.id, 'bien')).not.toThrow(); // remplace, ne duplique pas
  const lignes = getDb().prepare('SELECT COUNT(*) AS n FROM night_verdicts WHERE night_id = ?').get(nuit.id) as { n: number };
  expect(lignes.n).toBe(1);
});
```

(Adapter aux helpers réellement exportés par lib/nights.ts : `createNight`, `boxOutNight`, `endNight` — vérifier leurs signatures dans le fichier avant d'écrire.)

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `npx vitest run tests/unit/db.test.ts`
Expected: FAIL — `no such table: night_verdicts`

- [ ] **Step 3: Créer la table et la lib**

Dans `lib/db.ts`, dans `SCHEMA` juste après `game_votes` :

```sql
-- v3.7.0 (verdict du jeu) : le ressenti après la soirée — UNIQUE par (nuit, joueur),
-- révocable (revoter remplace). game_id est copié de nights.game_id au moment du vote
-- (mis à jour à chaque re-vote) pour que les agrégats évitent les jointures.
CREATE TABLE IF NOT EXISTS night_verdicts (
  night_id INTEGER NOT NULL REFERENCES nights(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  verdict TEXT NOT NULL CHECK (verdict IN ('adore','bien','neutre')),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(night_id, user_id)
);
```

`lib/verdicts.ts` :

```ts
import { getDb } from './db';
import { getNight, isNightParticipant, type NightGameResult } from './nights';

export type Verdict = 'adore' | 'bien' | 'neutre';
const VERDICTS: Verdict[] = ['adore', 'bien', 'neutre'];

// Le verdict du jeu : on ne peut juger qu'une soirée TERMINÉE avec sa boîte posée,
// et seulement si on y était. Revoter remplace (révocable, comme le vote étagère).
export function poserVerdict(nightId: number, userId: number, verdict: Verdict): NightGameResult {
  const db = getDb();
  const night = getNight(nightId);
  if (!night) return { error: 'Partie introuvable', status: 404 };
  if (!isNightParticipant(nightId, userId))
    return { error: 'Seuls les joueurs de la partie peuvent donner leur verdict', status: 403 };
  if (night.status !== 'termine')
    return { error: night.status === 'en_jeu' ? 'La partie est en cours — le verdict se donne après' : 'La soirée n’a pas encore commencé', status: 409 };
  if (!night.game_id) return { error: 'Aucune boîte à juger', status: 409 };
  if (!VERDICTS.includes(verdict)) return { error: 'Verdict invalide', status: 400 };
  db.prepare(`
    INSERT INTO night_verdicts (night_id, user_id, game_id, verdict)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(night_id, user_id)
    DO UPDATE SET verdict = excluded.verdict, game_id = excluded.game_id, created_at = excluded.created_at
  `).run(nightId, userId, night.game_id, verdict);
  notifyNight(nightId); // exporter notifyNight depuis lib/nights.ts (ajouter `export` ligne 23)
  return { ok: true };
}

export function verdictsDeNuit(nightId: number): { adore: number; bien: number; neutre: number } {
  const rows = getDb().prepare(
    'SELECT verdict, COUNT(*) AS n FROM night_verdicts WHERE night_id = ? GROUP BY verdict'
  ).all(nightId) as { verdict: Verdict; n: number }[];
  const compteurs = { adore: 0, bien: 0, neutre: 0 };
  for (const r of rows) compteurs[r.verdict] = r.n;
  return compteurs;
}

export function monVerdict(nightId: number, userId: number): Verdict | null {
  const row = getDb().prepare(
    'SELECT verdict FROM night_verdicts WHERE night_id = ? AND user_id = ?'
  ).get(nightId, userId) as { verdict: Verdict } | undefined;
  return row?.verdict ?? null;
}
```

- [ ] **Step 4: Lancer les tests, vérifier que ça passe**

Run: `npx vitest run tests/unit/db.test.ts tests/unit/verdicts.test.ts`
Expected: PASS (créer `tests/unit/verdicts.test.ts` avec au moins : remplacement, `game_id` copié = `nights.game_id` courant, gardes 404/403/409, verdict invalide 400)

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts lib/verdicts.ts lib/nights.ts tests/unit/
git commit -m "feat(verdict): table night_verdicts + poserVerdict révocable"
```

### Task 2: Poids au tirage — `poidsVerdicts` + `pickWeightedGameId`

**Files:**
- Modify: `lib/verdicts.ts` (ajout), `lib/draw.ts`, `app/api/draw/route.ts:25` (appel)
- Test: `tests/unit/verdicts.test.ts` (extend), `tests/unit/draw.test.ts` (extend)

**Interfaces:**
- Consumes: `night_verdicts` (T1)
- Produces: `poidsVerdicts(gameIds: number[]): Map<number, number>` ; `pickWeightedGameId(entries: { id: number; poids: number }[], rnd?: () => number): number` (rnd injecté, défaut `Math.random`) ; la route draw passe `poids` dans `picks` ? NON — `picks` reste tel quel, seul le choix est pondéré.

- [ ] **Step 1: Tests du poids (échouent)** — dans `tests/unit/verdicts.test.ts` :

```ts
describe('poidsVerdicts', () => {
  it('sans verdict → ×1,00 exact', () => {
    const p = poidsVerdicts([999]);
    expect(p.get(999)).toBe(1);
  });
  it('unanimement adoré, 3+ verdicts → ×1,08 (borne)', () => {
    // planter 3 verdicts 'adore' sur un jeu via poserVerdict (3 users, nuit terminée)
    const p = poidsVerdicts([jeuId]);
    expect(p.get(jeuId)).toBeCloseTo(1.08, 5);
  });
  it('un seul adore → confiance 1/3 → ×1 + 0,08×1×(1/3)', () => {
    const p = poidsVerdicts([jeuId]);
    expect(p.get(jeuId)).toBeCloseTo(1 + 0.08 / 3, 5);
  });
  it('1 adore + 1 neutre → score 0,5 → ×1 + 0,08×0,5×min(1, 2/3)', () => { /* ~1,0267 */ });
  it('unanimement neutre → ×1,00', () => { /* score 0 */ });
  it('dominant neutre (2 neutre, 1 adore) → ×0,98×... jamais sous 0,98', () => {
    // score = (1-2)/3 = -1/3 → 1 + 0,02×(-1/3)×min(1, 1) = 0,99333
  });
  it('jamais hors bornes [0,98 ; 1,08] quel que soit n', () => { /* boucle sur cas plantés */ });
});

describe('pickWeightedGameId', () => {
  it('rnd=0 → premier poids plein ; rnd proche de 1 → dernier', () => {
    const e = [{ id: 1, poids: 1 }, { id: 2, poids: 3 }];
    expect(pickWeightedGameId(e, () => 0)).toBe(1);
    expect(pickWeightedGameId(e, () => 0.999)).toBe(2);
  });
  it('poids 0 → jamais choisi', () => {
    expect(pickWeightedGameId([{ id: 1, poids: 0 }, { id: 2, poids: 1 }], () => 0)).toBe(2);
  });
  it('liste vide → throw', () => {
    expect(() => pickWeightedGameId([], () => 0)).toThrow();
  });
});
```

- [ ] **Step 2: Lancer, vérifier FAIL** — Run: `npx vitest run tests/unit/verdicts.test.ts` → FAIL (fonctions absentes)

- [ ] **Step 3: Implémenter**

Dans `lib/verdicts.ts` :

```ts
// Poids doux au tirage : score = (😍 − 😐)/total, amplitude ±8 %/−2 % lissée par la
// confiance min(1, n/3). Borne garantée : [×0,98 ; ×1,08] — garde-fou du backlog.
export function poidsVerdicts(gameIds: number[]): Map<number, number> {
  const poids = new Map<number, number>();
  if (gameIds.length === 0) return poids;
  const q = gameIds.map(() => '?').join(',');
  const rows = getDb().prepare(`
    SELECT game_id,
           SUM(verdict = 'adore') AS adore,
           SUM(verdict = 'neutre') AS neutre,
           COUNT(*) AS n
    FROM night_verdicts WHERE game_id IN (${q}) GROUP BY game_id
  `).all(...gameIds) as { game_id: number; adore: number; neutre: number; n: number }[];
  const parJeu = new Map(rows.map((r) => [r.game_id, r]));
  for (const id of gameIds) {
    const r = parJeu.get(id);
    if (!r) { poids.set(id, 1); continue; }
    const score = (r.adore - r.neutre) / r.n;
    const confiance = Math.min(1, r.n / 3);
    const mult = score > 0 ? 1 + 0.08 * score * confiance
               : score < 0 ? 1 + 0.02 * score * confiance
               : 1;
    poids.set(id, Math.min(1.08, Math.max(0.98, mult)));
  }
  return poids;
}
```

Dans `lib/draw.ts` (le fichier fait 6 lignes — on garde `pickGameId`) :

```ts
// Tirage pondéré : cumul des poids, la roulette tombe dans le segment du jeu.
export function pickWeightedGameId(
  entries: { id: number; poids: number }[],
  rnd: () => number = Math.random
): number {
  if (entries.length === 0) throw new Error('sélection vide');
  const total = entries.reduce((s, e) => s + Math.max(0, e.poids), 0);
  if (total <= 0) return entries[0].id;
  let ticket = rnd() * total;
  for (const e of entries) {
    ticket -= Math.max(0, e.poids);
    if (ticket < 0) return e.id;
  }
  return entries[entries.length - 1].id;
}
```

Dans `app/api/draw/route.ts` (l.25), remplacer `const gameId = pickGameId(ids);` par :

```ts
const poids = poidsVerdicts(ids);
const gameId = pickWeightedGameId(ids.map((id) => ({ id, poids: poids.get(id) ?? 1 })));
```

- [ ] **Step 4: Tests PASS + draw.test.ts reste vert** — Run: `npx vitest run tests/unit/` → PASS

- [ ] **Step 5: Commit**

```bash
git add lib/verdicts.ts lib/draw.ts app/api/draw/route.ts tests/unit/
git commit -m "feat(verdict): poids continu+confiance au tirage (bornes x1,08/x0,98)"
```

### Task 3: Route `POST /api/nights/[id]/verdict`

**Files:**
- Create: `app/api/nights/[id]/verdict/route.ts`
- Test: `tests/unit/verdicts.test.ts` (gardes déjà couvertes en T1 via lib) + E2E en T4

**Interfaces:**
- Consumes: `poserVerdict` (T1), `getSessionUser` (lib/session.ts), `getNight`, `userCanAccessNight` (lib/nights.ts)
- Produces: `POST { verdict: 'adore'|'bien'|'neutre' }` → `{ ok: true }` | `{ error }` (401/403/404/409/400) — pattern exact de `app/api/nights/[id]/votes/route.ts`

- [ ] **Step 1: Écrire la route** (copie du gabarit votes, corps `{ verdict }` au lieu de `{ gameId }`) :

```ts
// POST { verdict } : le verdict 😍🙂😐 du joueur connecté sur la boîte de la soirée terminée.
// Gabarit de la route votes : gardes de session et d'accès, la logique vit dans lib/verdicts.
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getNight, userCanAccessNight } from '@/lib/nights';
import { poserVerdict, type Verdict } from '@/lib/verdicts';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const nightId = Number((await params).id);
  if (!Number.isInteger(nightId) || !getNight(nightId) || !userCanAccessNight(user.id, nightId))
    return NextResponse.json({ error: 'Soirée introuvable' }, { status: 404 });
  const { verdict } = await req.json();
  const res = poserVerdict(nightId, user.id, verdict as Verdict);
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Vérifier la suite verte** — Run: `npx vitest run && npx tsc --noEmit` → PASS
- [ ] **Step 3: Commit**

```bash
git add app/api/nights/\[id\]/verdict/route.ts
git commit -m "feat(verdict): route POST /api/nights/[id]/verdict"
```

### Task 4: `VerdictBloc` sur la nuit terminée (+ UserSync) — E2E 2 joueurs

**Files:**
- Create: `components/VerdictBloc.tsx`
- Modify: `app/nights/[id]/page.tsx` (rendu du bloc entre le podium l.52 et `<PartagerResultats … />` l.53 + `<UserSync />`)
- Test: `tests/e2e/verdict.spec.ts` (create)

**Interfaces:**
- Consumes: `verdictsDeNuit`, `monVerdict` (T1), route T3, `<UserSync />` (components/UserSync.tsx — refresh via SSE `notifyNight`)
- Produces: hooks E2E stables — bloc `aria-label="Ton verdict"`, boutons `aria-label="Verdict : adoré"`, `"Verdict : bien"`, `"Verdict : neutre"`, compteurs `.verdict-compteurs`

- [ ] **Step 1: VerdictBloc (client)** — copie fidèle de la maquette validée :

```tsx
'use client';
// Le verdict 😍🙂😐 : 3 pastilles géantes, révocables, compteurs du groupe (sans attribution).
// Pattern du vote étagère (ShelfClient.voter) : POST mince → router.refresh().
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Verdict = 'adore' | 'bien' | 'neutre';
const PASTILLES: { v: Verdict; emo: string; label: string }[] = [
  { v: 'adore', emo: '😍', label: 'Verdict : adoré' },
  { v: 'bien', emo: '🙂', label: 'Verdict : bien' },
  { v: 'neutre', emo: '😐', label: 'Verdict : neutre' },
];

export default function VerdictBloc({ nightId, titreJeu, initial, compteurs }: {
  nightId: number; titreJeu: string;
  initial: Verdict | null;
  compteurs: { adore: number; bien: number; neutre: number };
}) {
  const router = useRouter();
  const [mien, setMien] = useState<Verdict | null>(initial);
  const [cptr, setCptr] = useState(compteurs);
  const [occupe, setOccupe] = useState(false);

  async function voter(v: Verdict) {
    if (occupe) return;
    setOccupe(true);
    const avant = mien;
    setMien(v);
    setCptr((c) => ({ ...c, [avant ?? v]: Math.max(0, c[avant ?? v] - (avant ? 1 : 0)), [v]: c[v] + 1 }));
    await fetch(`/api/nights/${nightId}/verdict`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verdict: v }),
    });
    setOccupe(false);
    router.refresh(); // le serveur renvoie les compteurs exacts (source de vérité)
  }
  // rendu : .verdict-bloc — kicker « Ton verdict », question, 3 boutons .pastille
  // (aria-pressed={mien === v}, aria-label de PASTILLES), note « ça pèse doucement… »,
  // confirmation visible si mien, compteurs .verdict-compteurs : 😍 {cptr.adore} · 🙂 …
}
```

(Le rendu JSX exact est dans la maquette validée — classes `.verdict-bloc`, `.pastille`, `.verdict-compteurs`, styles à ajouter dans `app/globals.css` bloc `.verdict-*` en fin de fichier.)

- [ ] **Step 2: Brancher la page détail** — dans `app/nights/[id]/page.tsx`, charger et rendre :

```tsx
import VerdictBloc from '@/components/VerdictBloc';
import UserSync from '@/components/UserSync';
import { verdictsDeNuit, monVerdict } from '@/lib/verdicts';
// dans le JSX, AVANT <PartagerResultats /> (l.53) :
{night.status === 'termine' && game && (
  <VerdictBloc nightId={night.id} titreJeu={game.title}
    initial={monVerdict(night.id, user.id)} compteurs={verdictsDeNuit(night.id)} />
)}
// + <UserSync /> à côté de <PartagerResultats /> (la page n'en a pas aujourd'hui :
// sans lui, les compteurs des autres ne rafraîchissent pas en direct)
```

- [ ] **Step 3: E2E 2 joueurs (échoue avant, passe après)** — `tests/e2e/verdict.spec.ts`, gabarit `votes.spec.ts` (register local, 2 contextes, `data-sync="on"`) :

```ts
// Parcours : solo → boîte → terminer → verdict visible, compteurs à 1,
// changement d'avis (re-clic) reste à 1 compteur ; duo : A vote, B voit le compteur
// bouger sans recharger (UserSync) ; non-membre : request.post → 403.
// Poids : après avoir posé des verdicts via request.post, le tirage (POST /api/draw)
// répond toujours un jeu de l'étagère — le chemin pondéré est exercé sans être
// dépendant du hasard (la distribution exacte est couverte en T2, rnd injecté).
// Hook fin de nuit : POST /api/nights/[id]/end via request (gabarit etats-scores.spec.ts).
```

- [ ] **Step 4: Suite verte complète** — Run: `npx vitest run && npx tsc --noEmit && npx playwright test tests/e2e/verdict.spec.ts tests/e2e/votes.spec.ts` → PASS
- [ ] **Step 5: Commit**

```bash
git add components/VerdictBloc.tsx app/nights/\[id\]/page.tsx app/globals.css tests/e2e/verdict.spec.ts
git commit -m "feat(verdict): bloc 😍🙂😐 sur la nuit terminée + sync live"
```

### Task 5: Agrégats — profil, fiche jeu, rappel Mes parties

**Files:**
- Modify: `lib/verdicts.ts` (2 fonctions), `lib/users.ts` (getMyParties : + `mon_verdict`), `components/ProfileClient.tsx` (stats l.163-167 + Mes parties l.171-188), `components/GameSheet.tsx` (ligne l.61), `app/profil/page.tsx` (props)
- Test: `tests/unit/verdicts.test.ts` (extend)

**Interfaces:**
- Consumes: `night_verdicts` (T1)
- Produces: `verdictPersoStats(userId: number): { jeu: string; adore: number; total: number }[]` (top 3 par total desc — « tu as adoré X : n fois sur total ») ; `verdictsJeu(gameId: number): { adore: number; bien: number; neutre: number }` ; `getMyParties` gagne `mon_verdict: Verdict | null` (LEFT JOIN night_verdicts sur night+user)

- [ ] **Step 1: Tests unitaires (échouent)** — favoris (ordre, ratio exact), verdictsJeu (compteurs), mon_verdict null si pas voté.
- [ ] **Step 2: FAIL** — Run: `npx vitest run tests/unit/verdicts.test.ts`
- [ ] **Step 3: Implémenter les 2 agrégats + la colonne de getMyParties** :

```ts
export function verdictPersoStats(userId: number) {
  return getDb().prepare(`
    SELECT g.title AS jeu, SUM(nv.verdict = 'adore') AS adore, COUNT(*) AS total
    FROM night_verdicts nv JOIN games g ON g.id = nv.game_id
    WHERE nv.user_id = ? GROUP BY nv.game_id ORDER BY total DESC, adore DESC LIMIT 3
  `).all(userId) as { jeu: string; adore: number; total: number }[];
}
```

UI : bloc profil « Tu as adoré {jeu} : {adore} fois sur {total} » (si adore ≥ 1, sinon « {jeu} : bien/neutralisé »… — libellés exacts de la maquette) ; Mes parties : badge `🗳️ Donne ton verdict` si `mon_verdict === null` sur la ligne ; GameSheet : `<li><span>Verdict de la table</span><strong>😍 {adore} · 🙂 {bien} · 😐 {neutre}</strong></li>` seulement si total > 0.

- [ ] **Step 4: PASS + E2E profil vert** — Run: `npx vitest run && npx playwright test tests/e2e/profil.spec.ts` → PASS
- [ ] **Step 5: Commit**

```bash
git add lib/verdicts.ts lib/users.ts components/ProfileClient.tsx components/GameSheet.tsx app/profil/page.tsx tests/unit/
git commit -m "feat(verdict): agrégats profil, fiche jeu et rappel Mes parties"
```

### Task 6: Version, CHANGELOG, backlog

**Files:** Modify: `package.json` (3.7.0), `CHANGELOG.md`, `futur-feature.md` (entrée #4 → « ✓ v3.7.0 »)
- [ ] **Step 1:** Entrée CHANGELOG (français, Keep a Changelog) : « Le verdict du jeu 😍🙂😐 — après la soirée, chacun juge la boîte ; compteurs en direct, stats de profil, poids doux au tirage (max ×1,10 d'écart). »
- [ ] **Step 2:** `npx vitest run && npx tsc --noEmit` → PASS, commit `chore(release): v3.7.0`
