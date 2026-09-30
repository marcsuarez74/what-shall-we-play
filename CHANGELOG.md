# Changelog

Toutes les évolutions notables de l'app sont documentées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) —
versionnement [sémantique](https://semver.org/lang/fr/) (`MAJOR.MINOR.PATCH`).

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
