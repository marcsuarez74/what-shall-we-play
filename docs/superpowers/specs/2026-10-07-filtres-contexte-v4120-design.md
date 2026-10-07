# Conception — Filtres de contexte avant le tirage (v4.12.0)

**Date** : 2026-10-07 · **Statut** : validé par le client (maquette v2 ; « ajoute 90 min », « ça dépasse fait gaffe » corrigé)
**Maquette validée** : `mockup/2026-10-07-v4120-filtres-contexte.html`

## 1. Décisions

- Les filtres **existants** de l'étagère (bouton « Filtres » : Joueurs, Complexité, Durée)
  **bornent désormais la roue**. Avant, « Lancer · N » les ignorait. Aucun nouveau composant.
- **Pool du tirage** = jeux de la partie ∩ filtres actifs ∩ (votés, si « Votés 👍 »).
  « Tous » et « Votés » affichent leur compte **filtré** ; « Lancer · N » affiche ce N.
- **La recherche ne borne pas la roue** : elle sert à retrouver une boîte, pas à choisir le pool
  (précision non montrée dans la maquette, qui ne la manipulait pas).
- **Votés sans résultat** (aucun jeu voté ne passe les filtres) : « Lancer » prend **tous les
  jeux filtrés** — comportement actuel du pool « Votés » vide (validé).
- **Aucun jeu ne passe les filtres** : « Lancer » désactivé, « Aucun jeu ne correspond aux
  filtres » sous le bouton.
- **Rien d'actif = comportement actuel.** Jeu sans donnée : jamais écarté par le critère manquant
  (règle existante de `filterShelf`).
- **Durée : 4 plages** — `< 30` · `30–60` · `60–90` · `90+` (l'ancienne « 60+ » est scindée).
  Libellé de la famille « Durée (min) », puces sans « min » (la ligne tient à 360 px).
  Valeurs : `court` < 30 ≤ `moyen` ≤ 60 < `long` ≤ 90 < `tres`.
- **Suggestion** dans le panneau des filtres de l'étagère : « Vous êtes N à jouer ce soir ·
  Filtrer sur N joueurs » (N = joueurs de la partie, invités compris). Un tap, jamais appliqué
  d'office ; masquée quand le filtre vaut déjà N. Absente de la ludothèque et du sélecteur.
- Sous « Lancer », quand un filtre est actif : « Filtres actifs : 4 joueurs · Légère ».
- Les filtres restent un **état local** (comme le choix du pool) : seul le créateur lance.

## 2. Code

- `lib/filters.ts` : durée à 4 valeurs ; `filtresActifs(f)` (nombre de familles actives hors
  recherche) réutilisé par le badge et la ligne d'état.
- `components/ShelfControls.tsx` : puces de durée, libellé « Durée (min) », prop facultative
  `suggestJoueurs`.
- `components/ShelfClient.tsx` : pool calculé depuis `filterShelf(games, { ...filters, q: '' })`,
  comptes, `Lancer` désactivé à 0, ligne « Filtres actifs ».

## 3. Tests

- Unitaires : `tests/unit/filters.test.ts` (4 plages, `filtresActifs`).
- E2E : `tests/e2e/filtres-tirage.spec.ts` — filtres → « Lancer · N » et l'URL du tirage ne
  porte que les jeux filtrés ; aucun résultat → bouton désactivé ; suggestion « Vous êtes N ».
  `etagere-ajouts.spec.ts` : puce « 90+ » au lieu de « 60+ min ».
