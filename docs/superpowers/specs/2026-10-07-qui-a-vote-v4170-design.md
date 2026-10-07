# v4.17.0 — Qui a mis un 👍 ? (spec)

Maquette validée : `mockup/2026-10-07-v4170-qui-a-vote.html` (2026-10-07).

## Besoin
Le badge 👍 donne le nombre de votes ; les prénoms n'étaient qu'un `title` (survol souris),
invisible sur téléphone.

## Décisions (validées)
- Les votants s'affichent **dans la fiche du jeu** (bottom-sheet `GameSheet`), pas sous la boîte.
- Ordre : les autres dans l'ordre du vote (`created_at`), **moi en dernier** (« Toi », entouré cuivre).
- Aucun vote : « 👍 Aucun vote » + astuce. Badge inchangé (tap = voter).
- Masqué quand les votes le sont (partie en jeu), comme le badge. Étagère joueurs et vue invité.

## Technique
- `lib/votants.ts` : `votantsDe(votes, gameId, players, meId)` (pur, testé) ; votant absent des
  joueurs gardé avec son pseudo.
- `GameSheet` : prop `votants?: { joueurs, moiId }` ; `PlayerChip` pour chaque votant.
- Aucune donnée nouvelle, aucune migration : `getShelfVotes` est déjà ordonné et déjà envoyé.

## Tests
- Unitaires `votants-v4170.test.ts` ; E2E `votes.spec.ts` (Toi, Aucun vote, nom de A chez B, ordre).
