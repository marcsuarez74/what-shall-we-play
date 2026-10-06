# Design — Parties : corriger, créer en retard, supprimer (v4.1.0 + v4.2.0)

Date : 2026-10-04 · Statut : spec validée en maquette (`maquette-v41-parties.html`,
session `.superpowers/brainstorm/65728-1791127561/content/`) · Demandes client du 2026-10-04

## Problème

Trois frottements remontés par le client :

1. L'app dit « soirée » partout alors qu'une partie peut se jouer à tout moment de la journée.
2. Un oubli est définitif : un score non noté, une partie jamais démarrée dans l'app, une date
   erronée — rien n'est corrigeable après coup, et supprimer/recréer ferait perdre verdicts
   et historique de tirage.
3. La roue tourne pour rien quand il n'y a qu'un seul jeu dans la sélection.

## Compréhension validée

- « Partie » devient le mot de l'app : FR « partie », EN « game ». Une partie peut se jouer
  jour et nuit.
- **Corriger une partie passée** = changer jeu / date / participants / scores. Le créateur
  **et les participants** peuvent corriger ou supprimer (choix client : tout le monde présent
  peut réparer l'oubli collectif).
- **Changer le jeu réinitialise les verdicts 😍🙂😐** de la partie — ils jugent une boîte
  précise ; l'UI alerte et demande confirmation avant d'envoyer.
- **Créer une partie passée** : un seul geste (date passée + jeu + participants + scores
  optionnels) — le cas « on a joué sans ouvrir l'app ».
- **Supprimer** : explicite, confirmée par une modale qui liste ce qui disparaît
  (garde-fou AGENTS.md : « une donnée n'est jamais détruite implicitement »).
- **Roue sautée** : sélection d'un seul jeu → pas d'animation, verdict direct.

## Décisions validées en brainstorming

1. **Vocabulaire « partie »** (client, choix parmi « partie / session / moment jeu / nuancer ») :
   balayage complet des dictionnaires (`fr.ts` : 18 occurrences ; `en.ts` : « game night » →
   « game ») — aucun « soirée » codé en dur dans les composants (tout passe déjà par les dicts,
   héritage v4.0.0). La FAQ v3.8.0 validée mot pour mot suit le même balayage (le renommage
   est une validation client explicite, elle l'emporte sur le verbatim de la maquette FAQ).
   Les 6 fichiers E2E qui épinglent les libellés sont mis à jour dans le même commit.
2. **Droits : créateur + participants** (choix client, contre l'option « créateur seul ») —
   la correction est un geste collectif. Les autres membres du foyer : 404 (pattern votes).
3. **Verdicts au changement de jeu : réinitialisés** (choix client) — jamais transférés (ils
   jugent l'ancienne boîte), jamais verrouillés (corriger une erreur de boîte est légitime).
   L'alerte ⚠️ de la maquette s'affiche dès le changement, la confirmation part avec
   l'enregistrement.
4. **Création rétroactive en un geste** (choix client) — entrée dédiée « ＋ Créer une partie
   passée » dans l'entête de **Mes parties**. Le flux « Planifier » reste tourné vers l'avenir
   (l'alerte de la maquette y renvoie). L'auteur de la création rétroactive devient créateur
   de la partie.
5. **Correction en place** sur la page de la partie terminée (bloc « Corriger cette partie »
   dépliable) — pas de page dédiée.
6. **Approche A (édition directe guidée)** contre B (ré-ouverture de soirée : le flux live —
   roue, notifications, verdicts — n'a pas de sens appliqué au passé) et C (supprimer + recréer :
   deux gestes, pertes inutiles).
7. **Pas de SSE pour les corrections rétro** : les participants voient les changements à leur
   prochaine visite ; le live reste réservé aux soirées en cours.
8. **Roue sautée** : `TirageClient` ne lance pas l'animation quand la sélection compte un seul
   jeu — passage direct à l'écran verdict. Le tirage passe toujours par le serveur
   (`pickWeightedGameId`, état partagé inchangé).

## Architecture

```
PATCH /api/nights/[id] ── gardes : session → 401 ; créateur OU participant → sinon 404
  │   corps partiel : played_at, game_id, player_ids, scores
  │   • played_at : date valide, jamais dans le futur
  │   • game_id changé → DELETE night_verdicts de la nuit (l'UI a confirmé avant d'envoyer)
  │   • participant retiré → ses night_scores supprimés explicitement
  │   • participant ajouté → night_players seul (score saisissable ensuite)
  │   • scores → upsert par participant présent
  └─ réponse : la partie à jour (shape GET)
DELETE /api/nights/[id] ── même droit ; CASCADE (joueurs, jeux, scores, picks, verdicts)
POST /api/nights/retro ── session requise ; played_at ≤ aujourd'hui ; crée la nuit directement
                          'termine' avec game_id + players + scores ; créateur = organisateur
```

- **Effets en aval gratuits** : stats de profil, Mes parties, compteurs de verdict et poids au
  tirage lisent la base — rien à recalculer, rien à migrer.
- **`night_games` et `picks` restent l'historique du live** : changer le jeu corrige
  `nights.game_id`, il ne réécrit pas l'historique de tirage ni « qui a ajouté quoi ».
- Pas de nouvelle table : `played_at` existe déjà (v1), les CASCADE de `nights` suffisent.

## Nouvelles pièces

| Pièce | Rôle |
|---|---|
| `lib/i18n/fr.ts`, `lib/i18n/en.ts` | balayage « partie » / « game » + chaînes des nouveaux écrans |
| `components/TirageClient.tsx` | sélection = 1 jeu → pas de roue, verdict direct |
| `lib/nights.ts` | `corrigerNuit`, `supprimerNuit`, `creerNuitRetro` (gardes serveur) |
| `app/api/nights/[id]/route.ts` | PATCH + DELETE |
| `app/api/nights/retro/route.ts` | POST création rétroactive |
| `app/nights/[id]/page.tsx` | bloc « Corriger cette partie » + bouton supprimer (si créateur/participant) |
| `components/CorrigerPartie.tsx` | formulaire de la maquette : date, jeu, participants chips, scores ; alerte verdicts ; modale suppression |
| `components/CreerPartiePassee.tsx` | formulaire un geste (date passée, jeu, participants, scores optionnels) |
| Mes parties (`ProfileClient`) | entrée « ＋ Créer une partie passée » + pastille « Scores à saisir » (partie terminée sans score) |
| `CHANGELOG.md`, `package.json` | **v4.1.0** (vocabulaire + roue) puis **v4.2.0** (corrections) — MINOR |

## Tests

- **Unit** (`tests/unit/nights-edit.test.ts`) : gardes 401/404 ; changement de jeu → verdicts
  réinitialisés ; retrait de participant → ses scores partent ; date future rejetée ;
  upsert des scores ; DELETE → tout est parti ; retro → nuit 'termine' avec scores.
- **E2E** :
  - v4.1.0 : libellés « partie » mis à jour dans les specs existantes (même commit) ;
    sélection d'un seul jeu → verdict direct sans animation.
  - v4.2.0 : corriger un score → profil à jour ; créer une partie passée → visible dans
    Mes parties et dans les stats ; supprimer avec confirmation → disparition complète ;
    changement de jeu → alerte puis verdicts à zéro ; non-membre → 404.

## Hors périmètre

- Pastille « Corrigée ✓ » de la maquette (illustration, pas de suivi des corrections en v1).
- Ré-ouverture d'une partie (approche B, refusée).
- Invités sans compte (backlog #2) — brancheront sur le même modèle plus tard.
- Dates passées dans « Planifier » (le créateur de soirées reste tourné vers l'avenir).
- Import BGG (bloqué sur le token, dossier distinct).
