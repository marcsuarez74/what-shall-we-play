# Changelog

Toutes les évolutions notables de l'app sont documentées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) —
versionnement [sémantique](https://semver.org/lang/fr/) (`MAJOR.MINOR.PATCH`).

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
