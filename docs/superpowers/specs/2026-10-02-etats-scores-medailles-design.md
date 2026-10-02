# Design — La vie d'une partie : états, carnet des scores, médailles (v3.3.0)

Date : 2026-10-02 · Statut : spec validée en maquette (`maquette-v33-etats-scores.html`, captures `captures-maquette/v33-*.png`)

## Problème

Aujourd'hui : chaque relance du tirage ajoute une ligne dans `picks` (« autant de jeux que de
relances »), « Sortir la boîte » est purement cosmétique, « Terminer la partie » archive sans
scores, et ni l'historique ni le profil ne racontent ce qui s'est joué.

## Compréhension validée

- La partie n'a pas commencé tant que la boîte n'est pas sortie ; le jeu pressenti est remplaçable.
- Sortir la boîte = le vrai début : le jeu est verrouillé, plus de relance.
- « Partie terminée » ouvre une saisie des scores (carnet), puis la partie rejoint l'historique
  avec son podium, et chaque joueur retrouve ses soirées et médailles sur son profil.

## Trois états, pas un de plus

| État | Signification | Entrée | Sortie |
|---|---|---|---|
| `creation` | étagère ouverte, sélections en cours | création de la soirée | « Sortir la boîte » ou abandon |
| `en_jeu` | la boîte est sortie, jeu verrouillé | POST box-out (par n'importe quel joueur) | « Partie terminée » (créateur) |
| `termine` | archivée, scores (ou pas) enregistrés | POST end | terminal |

L'état vit sur la carte d'étagère (badge), dans le tirage, l'historique et le profil.

## Schéma

```sql
ALTER TABLE nights ADD COLUMN status TEXT NOT NULL DEFAULT 'creation';
ALTER TABLE nights ADD COLUMN game_id INTEGER REFERENCES games(id); -- la boîte sortie
CREATE TABLE IF NOT EXISTS night_scores (
  night_id INTEGER NOT NULL REFERENCES nights(id) ON DELETE CASCADE,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score    REAL,
  UNIQUE(night_id, user_id)
);
-- backfill migration : UPDATE nights SET status='termine' WHERE ended_at IS NOT NULL
```

- `status` devient la vérité unique ; `ended_at` reste écrit (horodatage du détail) et
  synchronisé avec `termine`. `getActiveNight` lit `status != 'termine'`.
- `picks` reste l'audit des tours de roue (aucune suppression), mais **plus aucune UI ne lit les
  picks cumulés** : le jeu de la partie est `nights.game_id`, une seule ligne partout.
- Parties anciennes : migrées en `termine` sans scores (le détail affiche « pas de scores »).

## API

- `POST /api/draw` — refuse (409) si `status != 'creation'` (« La boîte est déjà sortie »).
- `POST /api/nights/[id]/box-out` `{ gameId }` — **n'importe quel joueur de la soirée** ;
  exige `status='creation'` (409 sinon), `gameId` doit être dans l'étagère (400 sinon) ;
  pose `game_id` + `status='en_jeu'` ; notifie (sync live).
- `POST /api/nights/[id]/end` — créateur seulement (règle existante) ; depuis `en_jeu` avec
  corps optionnel `{ scores: { [userId]: number } }` (joueurs de la soirée, nombres finis) →
  insère `night_scores`, `status='termine'`, `ended_at` ; sans scores (« Terminer sans
  scores ») → termine sans lignes. Depuis `creation` = abandon (sans scores). Double `end` → 409.
  Pas de double-appui « Sûr ? » ici : le carnet rempli EST la confirmation.

## Classement (fonction pure, unit-testée)

`rankScores([{userId, score}])` : tri desc, rangs denses — égalité = même rang/même médaille,
le rang suivant ne saute pas (1,1,2). Médailles : rang 1 👑, 2 🥈, 3 🥉. Un joueur sans score
n'existe pas dans le classement.

## Écrans

1. **Étagère (ShelfClient)** — badge d'état sur la carte ; `en_jeu` : bandeau vert (cover +
   « X est sortie de l'étagère ») et CTA créateur « 🏁 Partie terminée » → page scores ;
   `termine` : bandeau gris + CTA « Voir les scores dans Parties → » ; la création d'une
   nouvelle soirée (NightPicker) redevient disponible.
2. **Tirage (TirageClient)** — verdict : pastille « jeu pressenti — remplaçable » ; « Sortir la
   boîte » POST box-out → pastille verte « jeu de la partie ✓ », relance retirée, verrou
   affiché, CTA « 🏁 Partie terminée » ; au chargement d'une soirée déjà `en_jeu` : état
   verrouillé direct (pas de roue) ; sync live si un autre joueur sort la boîte.
3. **Nouveau `/nights/[id]/scores`** — plein écran (tabbar masquée), créateur seulement :
   cover + titre + date, une ligne par joueur de la soirée (avatar, pseudo, `input`
   numérique `inputmode="decimal"` **16 px** — ruling zoom iOS), médailles calculées en
   direct, « Enregistrer et terminer » → POST end + scores → redirige vers le détail ;
   « Terminer sans scores ».
4. **Nouveau `/nights/[id]` (détail)** — visible des joueurs de la soirée (`userCanAccessNight`,
   pattern existant) : cover, titre, date, badge Terminée, podium
   (1ʳᵉ carte bordée cuivre 👑, rang 2/3 en duo, autres en lignes), variante « pas de scores »,
   « 💬 Partager les résultats » (WhatsApp, pattern `announce` existant).
5. **`/nights`** — carte « Ce soir » avec badge d'état ; historique : une carte par partie
   (mini-cover, gagnant 👑 pseudo · score, date) → détail.
6. **`/profil`** — stats + compteur « podiums » (👑 a · 🥈 b · 🥉 c) ; section « Mes parties » :
   mini-cover, titre, date, mon score, ma médaille ; chaque ligne renvoie au détail.

## Sync live

box-out et end passent par `notifyNight` (pattern fetch-reader existant, jamais EventSource) :
les autres téléphones basculent d'état à la resynchronisation (rafraîchissement + battement 30 s).

## Tests (TDD)

- Unitaires `lib/` : transitions d'état (box-out valide/refusée, game hors étagère, end avec/
  sans scores, double end, abandon depuis creation, draw refusé hors creation), `rankScores`
  (tri, égalités 1-1-2, sans scores), requêtes profil/médailles, historique (gagnant).
- E2E : flux complet (valider → lancer → relancer remplace → sortir la boîte → verrou →
  terminer → carnet → podium → historique → profil 👑) ; permissions (invité sort la boîte OK,
  ne voit pas « Partie terminée ») ; « sans scores » ; sync live de l'état.
- Suites de référence avant release : unitaires + E2E verts, `tsc` propre.

## Hors scope (YAGNI)

Édition des scores après enregistrement, timer de partie, classement multi-parties par jeu,
podiums « par foyer », scores négatifs spéciaux ou pénalités.
