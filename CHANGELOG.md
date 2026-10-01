# Changelog

Toutes les évolutions notables de l'app sont documentées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) —
versionnement [sémantique](https://semver.org/lang/fr/) (`MAJOR.MINOR.PATCH`).

## [1.5.0] — 2026-10-01

### Ajouté
- **Recherche et filtres sur la bibliothèque** : barre de contrôles partagée avec l'étagère, plus une famille propre à la ludothèque — format de **boîte** (Grand/Moyen/Petit/Mini). Compteur « N jeux sur M » et lien « Tout afficher » quand des filtres mordent.

### Modifié
- **Filtres de l'étagère repensés** : contrôles segmentés étiquetés (Joueurs, Complexité, Durée) — plus lisibles, deux fois moins hauts, un tap pour changer de valeur.
- **QG Soirées repensé** : « Ce soir » devient la carte vivante à liseré cuivre ; les programmées affichent la date en héros (numéro du jour, mois, heure en badge) ; l'historique passe en rangées compactes scannables.

## [1.4.0] — 2026-10-01

### Ajouté
- **Soirées programmées** : programmez une soirée (date + heure + joueurs) depuis le QG. Le jour J, elle devient la soirée en cours automatiquement.
- **QG Soirées** repensé : « Ce soir » (soirée en cours et son verdict), « Programmées » (cartes avec date longue, heure, joueurs), « Historique ». La nuit active couvre désormais les participants, pas seulement les créateurs.
- **Annonce WhatsApp au verdict** : « 💬 Annoncer sur WhatsApp » compose le message (jeu tiré, qui ramène, qui est attendu, heure) et l'envoie via le partage natif — sinon lien wa.me. Aucun bot, aucun compte.
- **Invitation WhatsApp** sur chaque soirée programmée : date, heure et joueurs invités pré-remplis.

## [1.3.0] — 2026-10-01

### Ajouté
- **« Pas ce soir »** : écarte un jeu du tirage de la soirée depuis la fiche (étagère) ou les cartes de bibliothèque — portée soirée seulement, de retour demain. Section « Écartés ce soir » en bas de l'étagère pour les remettre.
- **Recherche et filtres sur l'étagère** : recherche (casse et accents ignorés), filtres joueurs (pré-rempli avec la soirée en cours), complexité (légère/moyenne/lourde) et durée (< 30 / 30–60 / 60+). Un jeu sans donnée n'est jamais écarté par un filtre.
- **Badge « apporté par »** sur chaque boîte : sticker ou photo du propriétaire, en coin de boîte.
- **Spinner discret** pendant le chargement des pochettes de l'étagère, fondu à l'arrivée.

## [1.2.1] — 2026-10-01

### Corrigé
- **Recadrage photo** : la photo s'affichait à sa taille naturelle (zoom implicite ×10 sur un téléphone) — l'affichage est désormais piloté par la même math que l'enregistrement (`lib/crop.ts`) : zoom minimum = photo cadrée juste, ce que tu vois = ce qui est enregistré.
- **Recadrage fiable** : le bouton « Recadrer ✓ » attend que la photo soit décodée (plus d'écran figé si on valide trop vite sur une grosse photo).
- **Caméra iOS** : les inputs photo ne sont plus en `display:none` (le `.click()` programmatique était aléatoire sur iOS).
- **Long press tactile** : appui maintenu robuste sur iPhone — fallback `touchstart` (vieux WebKit sans pointer events), `touch-action: pan-x` sur les boîtes (le navigateur ne transforme plus un maintien en scroll/zoom), et un `pointercancel` tardif d'un maintien réel déclenche quand même la sélection (`lib/press.ts`).

## [1.2.0] — 2026-10-01

### Ajouté
- **Page profil** (via le menu utilisateur → « Mon profil ») : avatar, pseudo, statistiques (parties jouées · soirées · jeux), changement de code, suppression de compte.
- **Avatar personnel** : sticker emoji au choix (grille de 32) ou photo (appareil ou galerie) avec **recadrage carré** (glisser + zoom, sortie 256×256) ; il remplace le dé dans les chips de joueurs, le menu et l'historique des soirées.
- **Changement de code** en 3 étapes (code actuel vérifié, confirmation du nouveau).
- **Suppression du profil** : avertissement détaillé + code secret exigé ; supprime le compte, la collection et les tirages — les soirées des autres sont conservées (cascade en transaction, fichiers avatar/pochettes nettoyés).
- **Sélection par longue pression** : maintenir une boîte 400 ms sur l'étagère entre en mode sélection (bandeau cuivre, toucher = ajouter/retirer, « Terminé » pour sortir) ; l'appui simple ouvre toujours la fiche.

### Modifié
- **Codes secrets = 4 chiffres** à l'inscription, au changement et à la validation de suppression (saisie type PIN, clavier numérique, 4 cases) ; la vérification à la connexion reste inchangée (bcrypt) et l'audit v1.2.0 confirme que les comptes existants utilisent déjà 4 chiffres.
- API `GET/PATCH/DELETE /api/me`, `POST /api/me/avatar`, `POST /api/me/code` ; colonnes `users.sticker` / `users.avatar_path` (migrations idempotentes).

## [1.1.0] — 2026-09-30

### Ajouté
- **Fiche jeu enrichie** (bottom-sheet) : complexité (poids BGG), « best joueurs » (sondage communautaire BGG, parseur prêt — se remplit dès que `BGG_TOKEN` est en place), créateur, illustrateur, **parties jouées** (nombre de tirages locaux) ; colonnes `designer`/`artist`/`best_players` (migration idempotente).
- **Logo officiel « Powered by BoardGameGeek »** sur le lien BGG de la fiche.
- **Ajout de jeu repensé** : titre + formats de boîte à l'échelle réelle + bouton « Récupérer les infos » (logo BGG intégré) → la fiche se remplit depuis BGG (année, éditeur, joueurs, durée, complexité, note, créateur, illustrateur, pochette remplaçable par une photo) ; saisie manuelle conservée en secours.
- **Navigation par onglets** en bas : Étagère · Bibliothèque · Ajouter · Soirées (masquée pendant la roue et hors session) ; menu utilisateur réduit à la déconnexion.
- **Ma bibliothèque détaillée** : cartes avec pochette, année · éditeur, joueurs, durée ; la fiche complète s'ouvre au toucher ; format et retrait restent en un geste.
- **Version affichée** dans le menu utilisateur ; nom de cache du service worker versionné automatiquement à chaque build (`wsp-v<version>`).
- Données des 29 jeux du fondateur complétées (crédits, poids, notes, best, formats de boîte).

### Corrigé
- Pochettes portrait qui débordaient de leur boîte sur l'étagère (image en flux absolu ; hauteur `100 %` non résolue dans une piste de grille auto).
- Étagère périmée ~30 s après un changement de format en bibliothèque (`staleTimes.dynamic = 0`).
- Titre « Ajouter un jeu » perdu dans la refonte du formulaire.

## [1.0.0] — 2026-09-30

### Ajouté
- **Comptes** : inscription/connexion par pseudo + code secret (bcrypt, sessions cookie 30 j).
- **Bibliothèque par joueur** : ajout manuel ou via recherche BoardGameGeek (préremplissage de la fiche, pochette rapatriée localement, cache 30 jours) ; édition du format de boîte ; suppression (refusée si le jeu a déjà été tiré).
- **Soirées** : on coche les joueurs présents — l'étagère combine les bibliothèques de tout le monde ; « journée » en heure Europe/Paris.
- **L'Étagère (accueil)** : rayons en scroll horizontal groupés par format de boîte (grand/moyen/petit/mini à taille relative réelle), fiche détail en bottom-sheet, sélection par bordure cuivrée + pastille ✓, CTA « Lancer le tirage · N ».
- **Tirage** : hasard cryptographique côté serveur (`node:crypto`), enregistré en base avant l'affichage ; roue plein écran cosmétique qui atterrit sur le jeu tiré ; verdict « LA ROUE A PARLÉ » avec vibration, « Sortir la boîte », « Relancer le tirage ».
- **Historique** des soirées (date, joueurs, jeux tirés).
- **PWA installable** : manifest + service worker minimal (cache statique et pochettes uniquement).
- **Déploiement** : Dockerfile multi-stage (node:22-alpine, sortie standalone, tzdata), docker-compose avec volume `./data`, README d'exploitation (reverse proxy HTTPS, sauvegarde SQLite).
- **CI** : build (Next.js + image Docker), tests (Vitest + Playwright), déploiement VPS sur push de main.

### Périmètre v1 (choix assumés)
- Tous les inscrits se voient entre eux (pas d'amis), pas de scores/stats, pas d'offline complet, pas d'i18n (français uniquement), pas d'admin.
- La recherche BGG fonctionne sans token d'application ; un `BGG_TOKEN` (header Bearer) est utilisé automatiquement s'il est configuré.
