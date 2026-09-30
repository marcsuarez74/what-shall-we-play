# Spec — What Shall We Play? (« L'Étagère »)

- **Date** : 2026-09-30
- **Statut** : proposée, en attente de relecture
- **Type** : nouveau projet — app web mobile-first (PWA) auto-hébergée sur VPS

## 1. Résumé

Une petite app pour trancher la question du soir : « on joue à quoi ? ». Chaque joueur gère
sa propre bibliothèque de jeux (enrichie par BoardGameGeek : pochette, joueurs, durée,
poids, note). Pour une soirée, on coche les joueurs présents ; leurs bibliothèques se
combinent en une étagère commune ; on y sélectionne les jeux de la nuit (scroll horizontal,
fiche détail, « ajouter à la sélection ») ; on lance le tirage, la roue du tiroir mouline,
et le jeu du soir s'affiche en plein écran.

- **Audience** : cercle privé de gros joueurs (les inscrits se connaissent)
- **Succès** : de l'ouverture de l'app au jeu tiré en moins d'une minute, en 3-4 écrans

## 2. Décisions arrêtées (avec le client)

1. **Une bibliothèque par joueur** ; les soirées combinent les bibliothèques des joueurs présents.
2. **Tous les inscrits sont visibles** entre eux (pas de système d'amis en v1) — cercle de confiance.
3. **La sélection du soir est explicite** : filtres en aide au remplissage, mais on ajoute/retire
   chaque jeu depuis l'étagère (fiche détail → « Ajouter à la sélection »).
4. **Inscription ouverte** (pseudo + code secret) — l'URL n'est pas publique.
5. **Stack** : Next.js (App Router, TypeScript) + SQLite, un conteneur Docker sur le VPS.
6. **Mobile-first / PWA installable** — navigation par onglets bas, cibles tactiles larges.
7. **Direction visuelle « L'Étagère »** : noyer/crème/cuivre, vraies pochettes, tailles de
   boîtes réalistes par format, roue « tiroir », verdict en écran de cérémonie.

## 3. Comptes et sécurité

- Inscription : **pseudo** (unique, insensible à la casse, 3-20 caractères) + **code secret**
  (4 caractères minimum), haché avec bcrypt. Pas d'e-mail, pas de récupération (v1).
- Session : cookie `httpOnly`, `sameSite=lax`, durées 30 jours. Table `sessions`.
- Uploads : pochettes jpg/png/webp ≤ 5 Mo, stockées sur le volume Docker.
- Les routes d'écriture exigent une session valide. Pas d'admin en v1.

## 4. Données (SQLite)

```
users        id, pseudo UNIQUE, code_hash, created_at
games        id, owner_id → users, bgg_id NULL, title, year NULL, publisher NULL,
             cover_url NULL, cover_path NULL (upload), min_players NULL, max_players NULL,
             playtime_min NULL, weight NULL (0-5), bgg_rating NULL,
             box_format ENUM('mini','petit','moyen','grand') NOT NULL, created_at
nights       id, creator_id → users, played_at (date), created_at
night_players night_id → nights, user_id → users, UNIQUE(night_id, user_id)
picks        id, night_id → nights, game_id → games, spinner_id → users, created_at
sessions     id (token aléatoire), user_id, expires_at
bgg_cache    bgg_id PK, payload_json, fetched_at
```

- `games` appartient à un joueur ; le compte peut être supprimé → ses jeux aussi (v1 :
  suppression simple, pas de transfert de propriété).
- Un jeu sans BGG (`bgg_id NULL`) est parfaitement valide (saisie manuelle).
- Le **format de boîte** est obligatoire : c'est lui qui dimensionne l'affichage étagère/roue
  (l'API BGG ne fournit pas les dimensions physiques).

## 5. Écrans et flux

| # | Écran | Contenu |
|---|-------|---------|
| 1 | Login / Inscription | pseudo + code ; inscription ouverte |
| 2 | **L'Étagère** (accueil) | carte « soirée » (joueurs présents, modifier), rayons en **scroll horizontal** groupés par format de boîte, tailles réelles, badge ✓ cuivré sur les boîtes sélectionnées, compteur « Sélection : N jeux », CTA « Lancer le tirage · N » |
| 3 | Fiche détail (bottom-sheet) | grande pochette, titre, année, éditeur, chips (joueurs, durée, poids, note BGG), propriétaire + format, « ＋ Ajouter à la sélection » / « Retirer », lien BGG |
| 4 | Ajouter un jeu | recherche BGG (si token) → formulaire pré-rempli ; sinon formulaire manuel ; upload de photo de pochette ; choix du format de boîte |
| 5 | Ma bibliothèque | mes jeux en liste, édition (dont format), suppression |
| 6 | Soirée (création/modif) | cocher les joueurs présents parmi les inscrits ; date |
| 7 | **Le tirage** (plein écran) | roue du tiroir : segments = pochettes de la sélection, tourne ~3,5 s, décélération, vibration à l'arrêt |
| 8 | **Le verdict** (plein écran) | pochette sous projecteur, titre, chips stats, « Sortir la boîte 📦 » / « Relancer », enregistré dans la soirée |
| 9 | Soirées | historique : date, joueurs, jeux tirés |

Flux du soir : Étagère → (fiche/ajouts) → Lancer le tirage → tirage → verdict → (relancer | sortir la boîte).

## 6. Logique de tirage

- Le hasard est **côté serveur** (RNG cryptographique) sur les jeux de la sélection ;
  le résultat est enregistré dans `picks` **avant** l'affichage du verdict.
- La roue est une animation cosmétique : elle ralentit et s'arrête sur le jeu déjà tiré.
- « Relancer » crée un nouveau `picks` dans la même soirée (l'historique garde tout).
- Une sélection vide désactive le CTA (« Ajoutez au moins une boîte »).
- Édge case : si la sélection ne contient que des jeux d'un seul joueur, ça marche pareil
  (une soirée peut n'avoir qu'un joueur présent).

## 7. Intégration BoardGameGeek

- Côté serveur uniquement : `GET /xmlapi2/search?query=…&type=boardgame` puis
  `GET /xmlapi2/things?id=…` → `name`, `yearpublished`, `minplayers`, `maxplayers`,
  `playingtime`, `averageweight` (via `stats=1`), `image`.
- **Token** : header `Authorization: Bearer <BGG_TOKEN>` dès que l'application est approuvée
  (inscription en cours côté BGG). Sans token : la recherche BGG est désactivée, la saisie
  manuelle reste complète. L'app est fonctionnelle sans BGG.
- **Cache** : chaque jeu BGG est mis en cache 30 jours (`bgg_cache`) ; max ~1 req/s vers BGG.
- La pochette BGG est copiée localement (volume) au moment de l'ajout → l'app ne dépend
  plus des serveurs BGG ensuite.

## 8. Design system

- **Palette** : noyer `#2A1F17` (fond), `#3A2B1F` (surfaces), crème `#F3E9DC` (texte),
  cuivre `#C96F3B` (action/accents), vert `#3E9B6E` (validation), textes doux `#8A7660` / `#B9A58C`.
- **Typo** : Bricolage Grotesque (titres), Space Grotesk (UI). Passages courts, voix directe
  (« Sortir la boîte », pas « Valider »).
- **Formats de boîte → tailles relatives** : grand 30×30 (référence 1,0), moyen ×0,78,
  petit ×0,62, mini ×0,45. Les rayons regroupent par format ; hauteur du rayon = la plus
  grande boîte du groupe.
- **Motifs** : rayons en scroll horizontal avec boîte coupée en bord d'écran, badge de
  sélection = bordure cuivrée 3 px + pastille ✓ (26 px, contour sombre), bottom-sheets à
  poignée, tab bar 3 onglets (Étagère · Ajouter · Soirées).
- **Motion** : une seule séquence orchestrée = le tirage (accélération → décélération →
  clac + vibration). Le reste est statique ; `prefers-reduced-motion` → transition brève sans roue.

## 9. Technique et déploiement

- **Next.js 14+ (App Router, TypeScript)**, UI sans framework lourd (composants maison),
  `better-sqlite3` (SQLite fichier sur volume).
- **PWA** : manifest (nom, icônes, thème noyer), service worker minimal (installable ;
  pas d'offline-first en v1).
- **Docker** : Dockerfile multi-stage + docker-compose (port 3000, volume `./data` pour
  `app.db` + `uploads/`). Derrière le reverse proxy du VPS (HTTPS géré côté VPS).
- **ENV** : `SESSION_SECRET`, `BGG_TOKEN` (optionnel), `NODE_ENV`.
- **Séparation** : logique BGG et tirage isolées dans des modules purs testables
  (`lib/bgg.ts`, `lib/draw.ts`), routes API minces, accès DB via un seul module `lib/db.ts`.

## 10. Tests

- **Unitaires** : `lib/draw.ts` (RNG borné, sélection vide, 1 jeu), `lib/bgg.ts`
  (parsing XML, cache, timeout), validation des formulaires (pseudo/code/format).
- **E2E (Playwright)** : parcours complet — inscription → ajout d'un jeu (manuel) →
  création de soirée avec 2 joueurs → sélection de 2 boîtes → tirage → `picks` enregistré
  → verdict affiché → relance.

## 11. Hors périmètre v1

Système d'amis, scores et stats de parties jouées, mode hors-ligne, notifications,
multi-langue, rôles/admin, récupération de compte, apps store natives.

## 12. Questions ouvertes

1. **Emplacement du code** : proposition — nouveau dossier `~/Documents/what-shall-we-play`
   (les photos restent dans `board-game`). À confirmer.
2. **Nom de domaine / sous-domaine** du VPS pour le HTTPS (ex. `jeu.<votre-domaine>`) —
   à définir au déploiement, non bloquant pour le développement.
