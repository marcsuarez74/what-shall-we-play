# Design — Import de collection BGG (v3.6.0)

Date : 2026-10-03 · Statut : spec validée en maquette (`maquette-v36-import-bgg.html`, session `.superpowers/brainstorm/v36-import-bgg/`)

## Problème

Le premier pas d'un nouveau joueur est le plus dur : saisir ses 40 jeux un par un. L'app sait déjà
parler à BGG jeu par jeu (`/api/bgg/search` → `/api/bgg/thing` → `POST /api/games`) — il manque
l'import **en masse** de la collection possédée.

## Compréhension validée

- Un champ « pseudo BGG » préremplit la ludothèque avec les jeux **possédés** (`own=1`) sur BGG.
- Succès : 40 jeux importés en moins d'une minute, sans doublon, relançable à volonté (nouvelles
  boîtes), échecs partiels assumés.
- Lecture seule côté BGG : rien n'est modifié sur BGG ; la preview ne modifie rien tant que
  « Importer » n'est pas touché.

## Décisions validées en brainstorming

1. **Point d'entrée** : lien secondaire sur la page « Ajouter » (« Importer toute une collection ») —
   l'ajout unitaire reste le chemin principal.
2. **Format de boîte** (BGG ignore les boîtes physiques, le champ est `NOT NULL`) : un choix global
   dans la preview (défaut « grand »), **ajustable par jeu** via la pastille 📦 ; une fiche enrichie
   n'a pas besoin de format (elle existe déjà).
3. **Dédoublonnage à 2 niveaux** :
   - même `bgg_id` déjà en ludothèque → « déjà présent », ignoré (grisé, non sélectionnable) ;
   - même titre normalisé qu'une fiche saisie à la main (sans `bgg_id`) → « doublon probable » :
     **enrichit la fiche existante par défaut** (les fiches manuelles manquent de poids/durée/
     joueurs/pochette — exactement ce que BGG apporte, et dont les suggestions intelligentes
     auront besoin) ; bascule « ＋ Nouveau » par ligne si c'est en fait une autre édition ;
     décoché = ignoré.
4. **Mécanique** : import piloté par le client — une seule nouvelle route (lecture), la boucle
   réutilise les routes d'écriture existantes. Pas de jobs, pas d'infra : progression visible,
   relance = idempotente par construction (dédoublonnage).

## Architecture

```
Preview (client)                     Boucle d'import (client, jeu par jeu)
────────────────                     ────────────────────────────────────
GET /api/bgg/collection?username=X   pour chaque jeu sélectionné :
  → XMLAPI2 /collection?own=1          GET /api/bgg/thing?id=N     (existant : cache 30 j,
    (gère le 202 « file BGG »)                                      garde 1 req/s, pochette)
  + GET /api/games (existant)             ├─ enrichir  → PATCH /api/games/[id]   (étendu)
  → dédoublonnage affiché                 └─ nouveau   → POST /api/games         (existant)
```

- Un jeu qui échoue n'arrête pas la boucle ; le récap liste les échecs, « Réessayer » rejoue
  uniquement les échecs (les réussis sont maintenant dédupliqués).
- ~1 s par jeu (garde de débit BGG existante) : 40 jeux ≈ 45 s, progression visible.

## Nouvelles pièces

| Pièce | Rôle |
|---|---|
| `lib/bgg.ts` : `fetchCollection(username)` + `parseCollectionXml(xml)` | `GET {BASE}/collection?username=X&own=1` via `bggFetch` ; le 202 (file d'attente BGG) est retenté jusqu'à ~15 s (`Retry-After`, plafonné) ; parse `{bggId, titre, annee, thumb}` — la collection ne donne **pas** joueurs/durée/poids (ce sera le rôle de `thing` pendant l'import) |
| `app/api/bgg/collection/route.ts` | session requise ; pseudo validé (trim, 1–60 car.) ; erreurs : `BGG_UNAVAILABLE` (502), pseudo/collection introuvable ou privée (404, message clair) |
| `app/games/import/page.tsx` + `components/ImportBggClient.tsx` | le flux de la maquette : pseudo → preview (segmenté global, pastilles 📦, cases, badges doublons) → import (progression, journal) → récap (réessai) |
| `components/AddGameForm.tsx` | + le lien d'entrée sous le bouton BGG |
| `app/api/games/[id]/route.ts` : PATCH étendu | le PATCH merge déjà `{...jeu, body}` via `validateGameInput` (donc year/publisher/joueurs/durée/poids/notes passent déjà, `title`/`box_format` préservés si non envoyés) — **delta** : ajouter `bgg_id` à l'UPDATE et accepter `cover_name` (pochette posée **seulement si le jeu n'en a pas**) ; garde `canManageGame` inchangé |

## Dédoublonnage

- **Ancrage `bgg_id`** : un jeu importé a toujours un `bgg_id` (donné par BGG). Ludothèque chargée
  via `GET /api/games` (existant) ; match par `bgg_id` → ignoré.
- **Titres** : match normalisé avec `normalizeText` (`lib/filters.ts`, déjà exportée — casse et
  accents) contre les jeux de la ludothèque **sans** `bgg_id` (saisis à la main) → « doublon
  probable ». Deux jeux BGG entre eux ne peuvent pas se doublonner (`bgg_id` uniques).
- Limites assumées (v1) : un jeu manuel nommé différemment de BGG ne sera pas reconnu (il sera
  importé en plus) ; les extensions BGG sont des `bgg_id` distincts, importées comme jeux.
- Pas de nouvelle contrainte serveur (KISS) : le client est le seul écrivain de ce flux, et la
  relance repose sur le dédoublonnage, pas sur un `UNIQUE`.

## Enrichissement (détail)

La fiche existante reçoit les valeurs BGG pour les champs listés ci-dessus, `title` et
`box_format` restent ceux du propriétaire, `bgg_id` est posé (ancre des imports futurs),
pochette seulement si le jeu n'en a pas (une photo perso ne se remplace pas implicitement).

## Erreurs & cas limites

| Cas | Comportement |
|---|---|
| BGG hors service / timeout | 502 « BGG ne répond pas — réessaie » ; l'app reste utilisable |
| Pseudo inconnu ou collection privée | 404 avec message « collection introuvable ou privée sur BGG » |
| 202 prolongé (file BGG) | retenté ~15 s puis message « BGG prépare ta collection, réessaie dans un instant » |
| Fiche `thing` en échec pendant l'import | jeu marqué « échec », boucle continue, récap + réessai |
| Collection vide (0 jeu possédé) | message « Aucun jeu possédé sur BGG » |
| Doublon probable enrichi | le joueur voit l'opération dans le journal (↻) et le récap |

## Hors périmètre (v1)

Wishlist/for-trade (`own=1` seulement), dédoublonnage a posteriori ou fusion manuelle, choix
d'édition entre plusieurs versions BGG, import CSV. La note `futur-feature.md` reste la source
(fonction #3, taille 🟢 S).

## Tests

- **Unitaires** : `parseCollectionXml` (items `own`, item sans nom, year absente) ; réessai 202
  (fetch mocké, plafond) ; classification dédoublonnage (`bgg_id` / titre normalisé / aucun) ;
  PATCH d'enrichissement (champs posés, `title`/`box_format` intacts, pochette préservée, 403
  non-gérant) ; validation pseudo.
- **E2E** (BGG mocké par interception de route) : parcours complet pseudo → preview → import →
  récap ; relance idempotente (le déjà-importé est ignoré) ; un échec simulé + réessai.

## Release

MINOR **v3.6.0** — branche → PR → CI (3 jobs) → fusion → déploiement → tag annoté → release
GitHub → vérif prod (`sw.js` = `wsp-v3.6.0`). Entrée CHANGELOG (français, Keep a Changelog) ;
décisions consignées au ledger `.superpowers/sdd/2026-10-03-import-bgg/progress.md`.
