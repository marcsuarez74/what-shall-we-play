# Conception — Choix libre / marathon (v4.19.0)

**Date** : 2026-10-08 · **Statut** : validé par le client (maquette v2 : « manches, sans score hors classement, un podium par partie » ; égalité : « Oui parfait »)
**Maquette validée** : `mockup/2026-10-08-v4190-choix-libre.html`

## 1. Décisions

- **Réglage par partie « Choix du jeu »** : 🎡 *Tirage au sort* (défaut, inchangé) ou
  🎲 *Choix libre*. Choisi à la création (NightPicker), modifiable tant que personne n'a
  déclaré de manche.
- **Choix libre = marathon** : pas de roue, pas de « Lancer ». L'étagère reste ouverte toute
  la partie ; on y enchaîne les jeux.
- **Tri** : dans chaque rangée de format, les jeux les plus votés 👍 à gauche (puis l'ordre
  actuel). Aucune rangée en plus.
- **Vetos gardés** : boîte grisée, impossible de la déclarer jouée. Un jeu déjà joué ne peut
  plus être vetoé. Votes et vetos restent ouverts tant que la partie n'est pas terminée.
- **Manches** : un même jeu peut être joué plusieurs fois dans la soirée. Dans la fiche :
  « J'ai joué cette manche » (score facultatif), « 🔁 Nouvelle manche ».
  **Une déclaration par joueur et par manche**, chacun saisit **son** score et ne modifie ou
  retire **que la sienne**. Pas de notification après la saisie.
- **Classement d'une manche** : rang dense sur le score (plus haut gagne). Égalité → même
  médaille, et la manche compte comme **gagnée par chacun** des ex æquo. Les joueurs sans
  score sont **hors classement**, listés à part (« a joué, sans score »).
- **Un podium par partie** : nombre de manches gagnées, rang dense, joueurs ayant gagné au
  moins une manche. Égalité → même médaille.
- **Fin** : le créateur clique « Terminer la partie » (confirmation). Les déclarations sont
  alors figées.
- **Un jeu joué compte** dans le programme de l'événement (« joué ») et dans le profil
  (podiums, mes parties).
- **Historique** : carte « N jeux · M manches » + gagnant de la partie ; détail = podium de la
  partie puis la liste des manches avec leur gagnant.
- Hors lot : avis 😍/👍/😐 en Choix libre ; déclaration depuis la vue invité restreinte.
- **Mode classique strictement inchangé.**

## 2. Modèle et serveur

```sql
ALTER TABLE nights ADD COLUMN mode TEXT NOT NULL DEFAULT 'tirage';  -- 'tirage' | 'libre'
CREATE TABLE IF NOT EXISTS night_plays (
  id INTEGER PRIMARY KEY,
  night_id INTEGER NOT NULL REFERENCES nights(id) ON DELETE CASCADE,
  game_id  INTEGER NOT NULL REFERENCES games(id),
  manche   INTEGER NOT NULL,            -- 1, 2, … par jeu
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score    REAL,                        -- NULL = joué sans score
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(night_id, game_id, manche, user_id)
);
```

Aucune donnée existante touchée : les parties actuelles prennent `mode = 'tirage'`.
En Choix libre la partie reste au statut `creation` jusqu'à « Terminer » → `termine`.

`lib/libre.ts` (nouveau, fonctions pures + accès base) :
- `getNightPlays(nightId)` → lignes `{game_id, manche, user_id, pseudo, sticker, avatar_path, score}`.
- `declarerManche(nightId, userId, gameId, manche, score|null, lang)` — upsert de **ma** ligne.
  Gardes : 404 partie ; 403 non participant ; 409 mode ≠ libre ; 409 terminée ;
  409 pas aujourd'hui (future) ; 400 hors étagère ; 409 jeu vetoé ; 400 manche non entière
  ou > (dernière manche du jeu + 1) ; 400 score non fini. `notifyNight`.
- `retirerDeclaration(nightId, userId, gameId, manche, lang)` — supprime **ma** ligne
  (mêmes gardes de statut).
- `classerManche(lignes)` → `{classes: {user, score, rang}[], sansScore: user[], gagnants: id[]}`.
- `podiumPartie(plays)` → `{user, victoires, rang}[]` (rang dense, victoires ≥ 1).

Gardes ajoutées ailleurs :
- `boxOutNight` / tirage : 409 `soiree.errModeLibre` si mode libre.
- `toggleNightVote` / `toggleNightVeto` : en libre, ouverts tant que ≠ `termine` ; veto sur un
  jeu déjà joué → 409 `libre.errDejaJoue`.
- `removeNightGame` : 409 `libre.errJeuJoue` si le jeu a des déclarations (aucune perte implicite).
- `endNight` en libre : ignore `scores`, passe à `termine`.
- `PATCH` mode : créateur, statut `creation`, aucune déclaration → sinon 409 `libre.errModeVerrouille`.

Routes : `POST /api/nights/[id]/plays {gameId, manche, score}` et
`DELETE /api/nights/[id]/plays {gameId, manche}` (session joueur ou invité, comme `/votes`).
`POST /api/nights` et `PATCH /api/nights/[id]` acceptent `mode`.

Lectures :
- `jeuxProgramme` : `joue` vrai aussi si une partie terminée de l'événement a une déclaration du jeu.
- `getProfileStats.pod` : + podiums des parties libres terminées (rang ≤ 3 du podium de partie).
- `getMyParties` / `getHistoryCards` : parties libres avec médaille, « N jeux · M manches »,
  gagnant de la partie.

## 3. Interface

- `NightPicker` : cartes « Choix du jeu » 🎡 / 🎲 (maquette, écran « Nouvelle partie »).
- `ShelfRows` : prop `tri: 'votes'` (tri par 👍 dans la rangée) et `joues` (jeu → nb de
  manches) → badge « ✓ » / « ✓ ×N », « moi-joue » si j'y ai joué.
- `GameSheet` : prop `libre` → blocs par manche (classement, sans score à part, mon
  formulaire, modifier / retirer), « J'ai joué cette manche », « 🔁 Nouvelle manche ».
- `ShelfClient` : en libre, pas de « Lancer » ni de pool ; CTA « Terminer la partie »
  (créateur, double appui de confirmation).
- `app/nights/[id]` : en libre, podium de partie + liste des manches ; pas de carnet
  ni de `CorrigerPartie`.
- i18n FR/EN : clés `libre.*`.

## 4. Tests

- Unitaires `tests/unit/libre-v4190.test.ts` : déclarer / modifier / retirer, une ligne par
  joueur et manche, nouvelle manche bornée, gardes (mode, terminée, veto, hors étagère,
  non participant), égalité partagée, sans score hors classement, podium par victoires,
  retrait d'étagère refusé si joué, tirage refusé, programme et profil.
- E2E `tests/e2e/libre.spec.ts` : création en Choix libre, deux joueurs déclarent la même
  manche (scores), une 2ᵉ manche, terminer, historique avec podium de la partie.
