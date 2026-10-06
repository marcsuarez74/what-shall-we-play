# Vocabulaire « partie » + roue sautée (v4.1.0) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** L'app dit « partie » (et « game ») au lieu de « soirée » / « game night » / « ce soir », et saute l'animation de roue quand la sélection de tirage ne compte qu'un seul jeu.

**Architecture:** Zéro nouvelle table, zéro route : le balayage est confiné aux dictionnaires typés (`lib/i18n/fr.ts` = source de vérité, `en.ts` complétude forcée par `Record<CléDict, ValeurDict>`) ; la roue sautée est un garde côté `TirageClient` qui garde le POST `/api/draw` (hasard + état partagé côté serveur) et n'élide que l'animation.

**Tech Stack:** Next.js (App Router), React client components, dictionnaires i18n maison typés, Vitest (unit), Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-10-04-parties-design.md` (décisions 1 et 8 ; le présent plan couvre v4.1.0 seulement — les corrections de parties sont le plan v4.2.0, écrit après).

## Global Constraints

- Suite verte avant toute fin de tâche : `npx vitest run` + `npx playwright test` + `npx tsc --noEmit`.
- Toute chaîne UI passe par les dicts (`lib/i18n/fr.ts`, puis `lib/i18n/en.ts` — complétude vérifiée par `npx tsc --noEmit`, jamais à la main).
- Aucune clé de dict renommée : seules les **valeurs** changent (les clés `soiree.*` restent des identifiants internes non affichés).
- Accroches E2E (aria-label, textes épinglés) : mettre à jour les tests **dans le même commit** que les libellés (AGENTS.md §3).
- Pas de nouvelle dépendance, pas de maquette (retouches explicites — exception AGENTS.md §3).
- Version cible : **4.1.0** (MINOR) dans `package.json` — bump en Task 4 seulement.
- UI française par défaut : un balayage FR sans son pendant EN laisse tsc vert mais l'app incohérente — Tasks 2 et 3 sont dans la même PR.

## Review Focus

1. **Apostrophe de « Aujourd'hui » dans les sélecteurs** : `[aria-label="Aujourd'hui"]` (4 fichiers E2E) — l'apostrophe droite dans l'attribut HTML rendu est `'` ; un euphémisme ou une apostrophe typographique dans le sélecteur vide le locator silencieusement. Épinglé par les 4 mises à jour E2E de la Task 2.
2. **Le tirage 1 jeu passe toujours par POST `/api/draw`** : on n'élide que l'animation — un raccourci qui choisirait localement casserait l'état partagé (un autre joueur ne verrait pas la même boîte). Épinglé par `tirage.spec.ts` (le verdict immédiat est suivi de « Sortir la boîte » qui doit marcher).
3. **Le cas 2+ jeux reste animé** : `parcours.spec.ts` (Lancer · 2) épingle « LA ROUE A PARLÉ » — il ne doit pas bouger. Épinglé par la re-run E2E de la Task 1.
4. **Espaces particuliers dans les valeurs dict** : `\u00A0` de `soiree.quiJoue`, espace finale de `soiree.videAvant` ('…start one '), espace finale de `faq.r10a`/`faq.r1c` (concaténées avec le mot suivant) — les reproduire à l'identique. Épinglé par `tsc` (rien) + relecture des diffs + E2E FAQ/i18n.
5. **Pin exact i18n.spec** : `getByText('Game night', { exact: true })` (FAQ) devient `Today's game` — la valeur EN de `faq.kJeu` doit correspondre mot pour mot. Épinglé par la Task 3.

---

### Task 1: Kicker « un seul jeu » + roue sautée (TirageClient)

**Files:**
- Modify: `components/TirageClient.tsx` (draw() ~l.38-65, render ~l.105-110, verdict kicker ~l.114)
- Modify: `lib/i18n/fr.ts` (bloc `// Roue du tirage (Wheel).` ~l.100, ajouter `tirage.unSeulJeu`)
- Modify: `lib/i18n/en.ts` (même bloc, ajouter `tirage.unSeulJeu`)
- Test: `tests/e2e/tirage.spec.ts` (l.32-39), `tests/e2e/nights.spec.ts` (l.34), `tests/e2e/soirees.spec.ts` (l.114)

**Interfaces:**
- Consumes: POST `/api/draw` (inchangé, répond `{ gameId }`), `games: Game[]` prop.
- Produces: clé dict `tirage.unSeulJeu` (FR `'UNE SEULE BOÎTE EN LICE'`, EN `'ONLY ONE GAME READY'`) ; `TirageClient` n'affiche plus `.tirage-stage` quand `games.length === 1` et passe direct en phase `verdict`.

- [ ] **Step 1: Écrire les E2E qui échouent**

Dans `tests/e2e/tirage.spec.ts` — remplacer les deux attentes « LA ROUE A PARLÉ » (ce test tire avec 1 seul jeu, Cascadia) et ajouter l'absence de roue :

```typescript
  // v4.1.0 : un seul jeu en lice → pas de roue, verdict direct
  await expect(page.getByText('UNE SEULE BOÎTE EN LICE')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.tirage-stage')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Cascadia' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sortir la boîte 📦' })).toBeVisible();
  await expect(page.locator('.pastille.prov')).toContainText('jeu pressenti');
  // Relancer AVANT la boîte : le verdict se remplace, rien ne s'accumule
  await page.getByRole('button', { name: '↻ Relancer le tirage' }).click();
  await expect(page.getByText('UNE SEULE BOÎTE EN LICE')).toBeVisible({ timeout: 10_000 });
```

Dans `tests/e2e/nights.spec.ts` l.34 et `tests/e2e/soirees.spec.ts` l.114 (les deux tirent aussi avec 1 jeu : Azul seul / Cascadia seul) — remplacer :

```typescript
await expect(page.getByText('LA ROUE A PARLÉ')).toBeVisible({ timeout: 10_000 });
// →
await expect(page.getByText('UNE SEULE BOÎTE EN LICE')).toBeVisible({ timeout: 10_000 });
```

(soirees.spec garde son timeout 20_000.)

- [ ] **Step 2: Vérifier l'échec**

Run: `npx playwright test tests/e2e/tirage.spec.ts`
Expected: FAIL — « UNE SEULE BOÎTE EN LICE » introuvable (le kicker affiche « LA ROUE A PARLÉ »).

- [ ] **Step 3: Ajouter la clé aux deux dicts**

`lib/i18n/fr.ts`, dans le bloc `// Roue du tirage (Wheel).` après `'tirage.roueAParle'` :

```typescript
  'tirage.roueTourne': 'La roue tourne…',
  'tirage.roueAParle': 'LA ROUE A PARLÉ',
  'tirage.unSeulJeu': 'UNE SEULE BOÎTE EN LICE', // sélection d'un seul jeu : pas de roue (v4.1.0)
```

`lib/i18n/en.ts`, même emplacement :

```typescript
  'tirage.roueTourne': 'The wheel is spinning…',
  'tirage.roueAParle': 'THE WHEEL HAS SPOKEN',
  'tirage.unSeulJeu': 'ONLY ONE GAME READY',
```

(Reprendre les valeurs EN existantes de `roueTourne`/`roueAParle` telles qu'elles sont dans le fichier — ne pas les modifier.)

- [ ] **Step 4: Implémenter la roue sautée dans TirageClient**

Après les déclarations d'état (~l.33), ajouter :

```typescript
  const roueInutile = games.length === 1; // un seul jeu : rien à départager, verdict direct
```

Dans `draw()`, remplacer le bloc calcul de rotation + timer (de `const count = games.length;` jusqu'au `}, reduced ? REDUCED_MS : SPIN_MS);`) par :

```typescript
      setPicked(games[idx]);
      if (roueInutile) {
        // v4.1.0 : un seul jeu en lice — pas d'animation, verdict direct.
        // Le POST /api/draw reste la source (hasard + état partagé côté serveur).
        setPhase('verdict');
        navigator.vibrate?.(80);
        return;
      }
      const count = games.length;
      const jitter = jitterFor(count); // échantillonné UNE fois par tirage (pas par rendu)
      const target = finalRotation(idx, count, jitter);
      // Même point d'arrivée que target (mod 360), toujours ≥ 5 tours en avant
      setRotation((cur) => cur + ((((target - cur) % 360) + 360) % 360) + 5 * 360);
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      timer.current = setTimeout(() => {
        setPhase((p) => (p === 'spin' ? 'verdict' : p)); // la boîte peut sortir pendant le spin (sync live)
        navigator.vibrate?.(80);
      }, reduced ? REDUCED_MS : SPIN_MS);
```

Dans le render, conditionner l'étape de roue :

```typescript
      {!roueInutile && (
        <div className={'tirage-stage' + (phase === 'enjeu' ? ' voilee' : '')}>
          <Wheel games={games} rotation={rotation} />
          {phase === 'spin' && <p className="tirage-hint">{t('tirage.roueTourne')}</p>}
        </div>
      )}
```

Et le kicker du verdict (~l.114) :

```typescript
          <p className="verdict-kicker">{roueInutile ? t('tirage.unSeulJeu') : t('tirage.roueAParle')}</p>
```

- [ ] **Step 5: Vérifier le passage**

Run: `npx playwright test tests/e2e/tirage.spec.ts tests/e2e/nights.spec.ts tests/e2e/soirees.spec.ts`
Expected: PASS (tirage 1 jeu sans roue ; soirees/nights sur leur pin nouveau kicker ; le reste de ces specs inchangé).

Run: `npx playwright test tests/e2e/parcours.spec.ts`
Expected: PASS — la spec tire avec 2 jeux et épingle « LA ROUE A PARLÉ » (Review Focus n°3 : le multi-jeu reste animé).

Run: `npx tsc --noEmit`
Expected: PASS (clé `tirage.unSeulJeu` déclarée des deux côtés).

- [ ] **Step 6: Commit**

```bash
git add components/TirageClient.tsx lib/i18n/fr.ts lib/i18n/en.ts tests/e2e/tirage.spec.ts tests/e2e/nights.spec.ts tests/e2e/soirees.spec.ts
git commit -m "feat(tirage): un seul jeu en lice -> verdict direct sans roue (v4.1.0)"
```

---

### Task 2: Renommage FR — « partie » partout, plus de « ce soir »

**Files:**
- Modify: `lib/i18n/fr.ts` (table exhaustive ci-dessous)
- Modify: `tests/unit/announce.test.ts` (l.4 et l.34 — épingle « ce soir »)
- Modify: `tests/unit/i18n.test.ts` (garde anti-régression espaces)
- Modify: `tests/e2e/soirees.spec.ts` (l.203), `tests/e2e/parcours.spec.ts` (l.62-63), `tests/e2e/etats-scores.spec.ts` (l.126), `tests/e2e/nights.spec.ts` (l.45-46, l.63) — sélecteurs `[aria-label="Ce soir"]`

**Interfaces:**
- Consumes: rien de nouveau.
- Produces: valeurs FR de v4.1.0 ; la section QG s'appelle `Aujourd'hui` (son aria-label change — les 4 specs E2E doivent suivre **dans ce commit**).

- [ ] **Step 1: Écrire les tests unitaires (échec + garde espaces)**

`tests/unit/announce.test.ts` — l.4 :

```typescript
describe('messages de partie', () => {
```

l.31-35 (le message attendu perd « ce soir ») :

```typescript
    expect(buildResultMessage({ title: 'Azul', ownerPseudo: 'marc', waiting: ['léa', 'thibault'], time: '20:30' })).toBe(
      '🎲 Azul a été tiré au sort !\n'
      + '👉 marc ramène son jeu\n'
      + '🕗 On attend léa et thibault — à 20:30\n'
      + '🔗 etagere.marc-suarez.fr');
```

Et dans `tests/unit/i18n.test.ts` (describe `i18n` — garde anti-régression : les espaces particulières qui nourrissent des concaténations JSX doivent survivre au balayage) :

```typescript
  it('les espaces particulières survivent au balayage « partie » (concaténations JSX)', () => {
    expect(DICTS.fr['faq.r10a'].endsWith(' ')).toBe(true);
    expect(DICTS.fr['faq.r1a'].endsWith(' ')).toBe(true);
    expect(DICTS.fr['soiree.quiJoue']).toContain('\u00A0?');
    expect(DICTS.en['soiree.videAvant'].endsWith(' ')).toBe(true);
  });
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run tests/unit/announce.test.ts tests/unit/i18n.test.ts`
Expected: FAIL sur announce (« On attend léa et thibault — ce soir à 20:30 » ≠ attendu) ; PASS sur le garde i18n (les espaces sont encore là).

- [ ] **Step 3: Appliquer la table de valeurs FR (exhaustive)**

Dans `lib/i18n/fr.ts`, appliquer exactement (ligne actuelle → nouvelle valeur) :

| # | Clé | Nouvelle valeur |
|---|---|---|
| 1 | l.39 `etagere.videTexte` | `"On met sur l'étagère ce dont on a envie — chacun depuis sa ludothèque, sur son téléphone."` |
| 2 | l.79 `etagere.disponiblesCeSoir` | `'disponibles pour la partie'` |
| 3 | l.93 commentaire | `// Carte partie terminée (TermineeCard).` |
| 4 | l.94 `etagere.soireeTermineeAria` | `'Partie terminée'` |
| 5 | l.95 `etagere.soireeDuJour` | `'PARTIE DU JOUR'` |
| 6 | l.98 `etagere.scoresOk` | `"Scores enregistrés — retrouvez la partie dans l'onglet Parties."` |
| 7 | l.123 commentaire | `// Zone parties (QG /nights, détail /nights/[id], carnet des scores, NightPicker,` |
| 8 | l.134 `soiree.sansJeu` | `'Partie de jeux'` |
| 9 | l.166 commentaire | `// Erreurs retournées par les routes parties/tirage (t() avec le cookie de langue).` |
| 10 | l.169 `erreurs.soireeIntrouvable` | `'Partie introuvable'` |
| 11 | l.172 `soiree.errSeulsJoueursBoite` | `'Seuls les joueurs de la partie peuvent sortir la boîte'` |
| 12 | l.177 `soiree.errSeulCreateur` | `'Seul le créateur peut terminer la partie'` |
| 13 | l.187 `soiree.errVotesFigesTermine` | `'La partie est terminée — les votes sont figés'` |
| 14 | l.188 `soiree.errDoitEtreDansSoiree` | `'Vous devez être dans la partie'` |
| 15 | l.226 `verdict.errPasCommencee` | `'La partie n'a pas encore commencé'` (conserver l'apostrophe typographique `'`) |
| 16 | l.235 `annonce.attente` | `` `🕗 On attend ${qui}${time ? ` — à ${time}` : ''}` `` |
| 17 | l.126 `soiree.ceSoir` | `'Aujourd'hui'` |
| 18 | l.139 `soiree.sansScores` | `'Pas de scores — la partie est dans les annales.'` |
| 19 | l.158 `soiree.quiJoue` | `'Qui joue à cette partie\u00A0? Cochez les joueurs présents.'` (conserver `\u00A0`) |
| 20 | l.496 `meta.description` | `"L'étagère qui tire la partie du jour à la roue."` |
| 21 | l.502 `faq.kJeu` | `"La partie du jour"` |
| 22 | l.517 `faq.q11` | `"Comment on note la partie ?"` |
| 23 | l.519 `faq.r1a` | `"L'app de la partie du jour : tu marques tes envies sur "` (espace finale conservée) |
| 24 | l.523 `faq.r1c` | `" choisit la boîte de la partie, et chacun note scores et verdicts. Fini le « alors on joue à quoi ? » qui dure 40 minutes."` |
| 25 | l.524 `faq.r2` | `"La sélection du moment de ton groupe : les jeux prêts à sortir. Tu y votes 👍 pour tes envies du moment, et tout le monde voit les votes en direct."` |
| 26 | l.525 `faq.r3` | `"Un clic pour voter, re-clic pour retirer. Les votes se partagent en direct : quand la partie se prépare, chacun sait déjà ce que les autres ont envie de sortir."` |
| 27 | l.544 `faq.r8e` | `" (le repère : 30×30 cm). L'étagère regroupe les jeux par format, et les filtres laissent n'afficher qu'une taille — pratique pour une partie à table restreinte ou un pique-nique."` |
| 28 | l.550 `faq.r10a` | `"Après la partie, chacun dit si la boîte était "` (espace finale conservée) |
| 29 | l.562 `faq.r12b` | `" (sans compte, ajoutés à la partie) sont en préparation. Ils pourront jouer et être notés comme les autres."` |

- [ ] **Step 4: Vérifier unit + tsc**

Run: `npx vitest run tests/unit/announce.test.ts tests/unit/i18n.test.ts && npx tsc --noEmit`
Expected: PASS partout (les valeurs ne changent pas les types).

- [ ] **Step 5: Mettre à jour les sélecteurs E2E « Ce soir » (même commit que l'aria)**

Dans les 4 fichiers, remplacer **toutes** les occurrences (7 au total) :

```typescript
[aria-label="Ce soir"]   →   [aria-label="Aujourd'hui"]
```

- `tests/e2e/soirees.spec.ts` : 1 (l.203)
- `tests/e2e/parcours.spec.ts` : 2 (l.62, l.63)
- `tests/e2e/etats-scores.spec.ts` : 1 (l.126)
- `tests/e2e/nights.spec.ts` : 3 (l.45, l.46, l.63)

- [ ] **Step 6: Vérifier les E2E concernées**

Run: `npx playwright test tests/e2e/soirees.spec.ts tests/e2e/parcours.spec.ts tests/e2e/etats-scores.spec.ts tests/e2e/nights.spec.ts tests/e2e/faq.spec.ts`
Expected: PASS (section « Aujourd'hui », FAQ « partie du jour »).

- [ ] **Step 7: Balayage anti-reliquat FR**

Run: `grep -n "oiérée\|SOIRÉE\|ce soir\|du soir" lib/i18n/fr.ts components/ app/ --include="*.ts" --include="*.tsx" -r`
Expected: aucune correspondance dans les **valeurs** (les clés `soiree.*` restent, elles ne matchent pas « oiérée »… si un commentaire de dict échappe, le corriger au passage).

- [ ] **Step 8: Commit**

```bash
git add lib/i18n/fr.ts tests/unit/announce.test.ts tests/unit/i18n.test.ts tests/e2e/soirees.spec.ts tests/e2e/parcours.spec.ts tests/e2e/etats-scores.spec.ts tests/e2e/nights.spec.ts
git commit -m "feat(i18n): le vocabulaire passe de « soirée » à « partie » — jouable à tout moment de la journée (v4.1.0)"
```

---

### Task 3: Renommage EN — « game » partout, plus de « tonight »

**Files:**
- Modify: `lib/i18n/en.ts` (table exhaustive ci-dessous)
- Modify: `tests/e2e/i18n.spec.ts` (l.63 — pin exact `Game night`)

**Interfaces:**
- Consumes: clés inchangées (tsc force la complétude).
- Produces: valeurs EN de v4.1.0.

- [ ] **Step 1: Écrire l'E2E qui échoue (pin FAQ EN)**

`tests/e2e/i18n.spec.ts` l.63 :

```typescript
  await expect(page.getByText("Today's game", { exact: true })).toBeVisible();
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx playwright test tests/e2e/i18n.spec.ts -g "FAQ"`
Expected: FAIL — « Today's game » introuvable (la FAQ EN affiche encore « Game night »).

- [ ] **Step 3: Appliquer la table de valeurs EN (exhaustive)**

Dans `lib/i18n/en.ts` :

| # | Clé | Nouvelle valeur |
|---|---|---|
| 1 | l.36 `etagere.videTexte` | `'We put on the shelf whatever we fancy — everyone from their own library, on their phone.'` |
| 2 | l.58 `etagere.modifierPartie` | `'Edit the game'` |
| 3 | l.76 commentaire | `// "Add to the game" picker (ShelfPicker).` |
| 4 | l.79 `etagere.ajouterPartie` | `'Add to the game'` |
| 5 | l.84 `etagere.retirerAria` | `` ({ j }: Record<string, string | number>) => `Remove ${j} from the game` `` |
| 6 | l.85 `etagere.ajouterJeuAria` | `` ({ j }: Record<string, string | number>) => `Add ${j} to the game` `` |
| 7 | l.91 `etagere.soireeTermineeAria` | `'Game finished'` |
| 8 | l.120 commentaire | `// Games zone (QG /nights, /nights/[id] detail, score sheet, NightPicker,` |
| 9 | l.122 `soiree.titre` | `'My games'` |
| 10 | l.123 `soiree.ceSoir` | `'Today'` |
| 11 | l.126 `soiree.jeuPartie` | `` ({ j }: Record<string, string | number>) => `🎯 ${j} — today's game` `` |
| 12 | l.127 `soiree.videAvant` | `'No game today — schedule one or start one '` (espace finale conservée) |
| 13 | l.130 `soiree.aucuneProgrammee` | `'No games scheduled — the next one starts here.'` |
| 14 | l.131 `soiree.sansJeu` | `'Game'` |
| 15 | l.135 `soiree.retour` | `'← Games'` |
| 16 | l.136 `soiree.sansScores` | `'No scores — the game is in the record books.'` |
| 17 | l.142 `soiree.terminerPartie` | `'Finish the game'` |
| 18 | l.144 `soiree.programmerBtn` | `'＋ Schedule a game'` |
| 19 | l.145 `soiree.programmer` | `'Schedule a game'` |
| 20 | l.147 `soiree.nouvellePartie` | `'New game'` |
| 21 | l.148 `soiree.creerPartie` | `'Create a game'` |
| 22 | l.155 `soiree.quiJoue` | `"Who's playing this game? Tick everyone who's in."` |
| 23 | l.166 `erreurs.soireeIntrouvable` | `'Game not found'` |
| 24 | l.168 `soiree.errPasDansPartie` | `"You're not part of this game"` |
| 25 | l.169 `soiree.errSeulsJoueursBoite` | `"Only the game's players can bring the box out"` |
| 26 | l.171 `soiree.errPartieTerminee` | `'This game is over'` |
| 27 | l.174 `soiree.errSeulCreateur` | `'Only the creator can finish the game'` |
| 28 | l.175 `soiree.errDejaTerminee` | `'The game is already over'` |
| 29 | l.177 `soiree.errPartieIntrouvable` | `'Game not found'` |
| 30 | l.178 `soiree.errSeulsJoueursAjout` | `"Only the game's players can add games"` |
| 31 | l.181 `soiree.errSeulsJoueursRetrait` | `"Only the game's players can remove games"` |
| 32 | l.182 `soiree.errSeulsJoueursVote` | `"Only the game's players can vote"` |
| 33 | l.184 `soiree.errVotesFigesTermine` | `'The game is over — votes are locked'` |
| 34 | l.185 `soiree.errDoitEtreDansSoiree` | `'You must be part of the game'` |
| 35 | l.199 `tirage.jeuDeLaPartie` | `"today's game ✓"` |
| 36 | l.221 `verdict.errSeulsJoueurs` | `"Only the game's players can give their verdict"` |
| 37 | l.223 `verdict.errPasCommencee` | `"The game hasn't started yet"` |
| 38 | l.227-228 `annonce.invite` | `` `🎲 Game on ${dateLong}${time ? ` at ${time}` : ''}!\n👥 ${qui}\nMark your available games 🔗 etagere.marc-suarez.fr` `` |
| 39 | l.232 `annonce.attente` | `` `🕗 Waiting for ${qui}${time ? ` — at ${time}` : ''}` `` |
| 40 | l.259 `fiche.retirerPartie` | `'Remove from the game'` |
| 41 | l.344 `jeu.errDejaTire` | `'This game has already been drawn in a previous game'` |
| 42 | l.359 `profil.statNights` | `'games'` |
| 43 | l.390 `profil.delMilieu` | `" and your draws leave the app. Other people's games stay, without you. "` (espaces finales conservées) |
| 44 | l.493 `meta.description` | `"The shelf that spins the wheel to pick today's game."` |
| 45 | l.498 `faq.kJeu` | `"Today's game"` |
| 46 | l.515 `faq.r1a` | `"The app for today's game: you jot your wishes down on "` (espace finale conservée) |
| 47 | l.520 `faq.r2` | `"Your group's current shortlist: the games ready to come out. Drop a 👍 on what you fancy for the game — everyone sees the votes live."` |

- [ ] **Step 4: Vérifier tsc + unit + E2E i18n**

Run: `npx tsc --noEmit && npx vitest run tests/unit/i18n.test.ts && npx playwright test tests/e2e/i18n.spec.ts`
Expected: PASS (complétude typée intacte, FAQ EN « Today's game »).

- [ ] **Step 5: Balayage anti-reliquat EN**

Run: `grep -n "game night\|tonight\|Tonight" lib/i18n/en.ts`
Expected: aucune correspondance dans les valeurs (commentaires repris au passage).

- [ ] **Step 6: Commit**

```bash
git add lib/i18n/en.ts tests/e2e/i18n.spec.ts
git commit -m "feat(i18n): EN dit « game » (et « today's game ») — plus de game night ni tonight (v4.1.0)"
```

---

### Task 4: Version, CHANGELOG, suite verte complète

**Files:**
- Modify: `package.json` (`"version": "4.0.0"` → `"4.1.0"`)
- Modify: `CHANGELOG.md` (entrée 4.1.0 en tête)
- Modify: `AGENTS.md` (l.2 — la description du dépôt suit le vocabulaire)

**Interfaces:**
- Produces: état releasable v4.1.0 (la release elle-même suit le protocole repo, hors plan).

- [ ] **Step 1: Bumper la version**

`package.json` : `"version": "4.1.0"`.

- [ ] **Step 2: Écrire l'entrée CHANGELOG (français, Keep a Changelog)**

En tête de `CHANGELOG.md` :

```markdown
## [4.1.0] — 2026-10-04

### Added
- Tirage : un seul jeu dans la sélection → verdict direct, sans animation de roue
  (kicker « Une seule boîte en lice »).

### Changed
- Le vocabulaire passe de « soirée » à « partie » partout (FR et EN « game ») :
  une partie peut se jouer à tout moment de la journée — libellés, erreurs,
  messages de partage WhatsApp, meta description et FAQ (« la partie du jour »
  remplace « le jeu du soir »).
- La section du jour du QG s'appelle « Aujourd'hui » (et plus « Ce soir »).
```

- [ ] **Step 3: Mettre à jour la description du dépôt**

`AGENTS.md` l.2 : `PWA Next.js de tirage au sort du jeu du soir — https://etagere.marc-suarez.fr` devient `PWA Next.js de tirage au sort de la partie du jour — https://etagere.marc-suarez.fr`.

- [ ] **Step 4: Suite verte complète (garde-fou de release)**

Run: `npx vitest run && npx playwright test && npx tsc --noEmit`
Expected: 100 % PASS — toutes les suites, FR et EN.

- [ ] **Step 5: Commit**

```bash
git add package.json CHANGELOG.md AGENTS.md
git commit -m "chore(release): v4.1.0 — vocabulaire partie + roue sautée"
```

---

## Protocole de release (après le plan, hors tâches)

1. Worktree dédié + branche `feat/parties-v4-1` (skill using-git-worktrees).
2. Tasks 1→4, commits atomiques (chaque task = un commit).
3. PR → CI verte (4 jobs, dont détection docs-only) → fusion → déploiement.
4. Tag annoté `v4.1.0` sur main → le workflow **Release** crée la release GitHub (jamais à la main).
5. Vérif prod : `curl -s https://etagere.marc-suarez.fr/sw.js | grep -o "wsp-v[0-9.]*"` → `wsp-v4.1.0`.
