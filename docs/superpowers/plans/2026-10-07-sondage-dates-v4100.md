# Nouvelle partie unifiée et sondage de dates (v4.10.0) — Plan d'implémentation

**Spec** : `docs/superpowers/specs/2026-10-07-sondage-dates-v4100-design.md`
**Maquette** : `mockup/2026-10-07-v4100-sondage-dates.html` (v3)

## Contraintes

- KISS : aucune dépendance ; le formulaire existant (`NightPicker`) est enrichi, pas dupliqué.
- Réutiliser invitations (`inviter`, `night_invites`) et notifications (`notifier`).
- Chaînes FR + EN ; accroches E2E mises à jour dans le même commit.

## Tâches

- [x] **T1 — Données** : tables `sondages`, `sondage_dates`, `sondage_invites`, `sondage_reponses`.
- [x] **T2 — `lib/sondages.ts`** : créer, répondre, lister (invité / organisateur), retenir, supprimer, pastille.
- [x] **T3 — API** `/api/sondages…`.
- [x] **T4 — Formulaire unifié** : `NightPicker` avec « Quand ? » (3 modes), cercles partout, étagère et Parties.
- [x] **T5 — Parties** : sondages reçus (Invitations), sondages organisés (tableau, retenir, supprimer), pastille.
- [x] **T6 — Tests** : unitaires `sondages-v4100`, E2E formulaire + parcours sondage, specs existantes adaptées.
- [x] **T7 — Release** : CHANGELOG, version 4.10.0, PR.
