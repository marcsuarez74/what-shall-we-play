# Amis, cercles et invitations (v4.8.0) — Plan d'implémentation

**Spec** : `docs/superpowers/specs/2026-10-06-amis-cercles-v480-design.md`
**Maquette** : `mockup/2026-10-06-v480-cercles.html` (version 3, validée)
**Livré** : v4.8.0 (PR #66). Plan consigné après coup : il décrit le découpage suivi.

## Contraintes

- KISS : aucune dépendance ; quatre tables (`amities`, `cercles`, `cercle_membres`,
  `night_invites`) et une colonne (`users.lien_ami`).
- Une migration unique (`user_version` 2) : amis d'office entre comptes ayant joué ensemble.
- Rien n'est retiré implicitement : les joueurs déjà dans une partie restent proposés ;
  retirer un ami, quitter ou supprimer un cercle sont des gestes confirmés.
- Les invités par lien (sans compte) ne sont jamais amis ni membres d'un cercle.
- Chaînes FR + EN dans le même commit ; accroches E2E mises à jour avec l'UI.

## Tâches

- [x] **T1 — Données** (`lib/db.ts`) : tables, index unique `lien_ami`, migration 2
  (idempotente : un ami retiré ne revient pas).
- [x] **T2 — Amitié** (`lib/amis.ts`) : demande par pseudo (croisée = amis), réponse,
  retrait, lien d'ami (créé à la demande, amis dès l'ouverture), `listRelations`
  (amis + foyer) qui remplace `listComptes`.
- [x] **T3 — Cercles** (`lib/cercles.ts`) : création (créateur admin), ajout d'un ami,
  lien (libre → membre, validation → attente), validation, rôles (au moins un admin),
  retrait, quitter (le dernier membre emporte le cercle), réglage d'adhésion,
  suppression, `coMembres`, `viaCercles`.
- [x] **T4 — Invitations et activité** (`lib/invitations.ts`) : `invitables`,
  `filtrerJoueurs`, `inviter`, `repondre` (Dispo → joueur, Pas dispo → retiré, jusqu'au
  jour J), `inscrire` (organisateur), `mesInvitations`, `nbInvitationsEnAttente`,
  `invitesNuit`, `activiteAmis` (30 jours).
- [x] **T5 — API** : `/api/amis` (+ `/lien`), `/api/cercles` (+ `/[id]`, `/[id]/membres`,
  `/rejoindre`), `/api/nights/[id]/invitation` ; `/api/nights` POST (programmée → invite,
  du jour → inscrit, filtré aux relations) et PATCH (nouveaux joueurs invités sur une
  programmée) ; `/api/users` → relations.
- [x] **T6 — Écrans** : onglet Amis (`/amis` : Amis · Cercles · Activité), un cercle
  (`/amis/cercles/[id]`), liens reçus (`/ami`, `/cercles/rejoindre`, retour après
  connexion ou inscription via `?next=`), section Invitations et décompte de
  l'organisateur dans `/nights`, cercles dans « Programmer », moi figé « joueur d'office »,
  pastille sur Parties ; `BoutonAction`, `LienPartage`, `AjoutAmi`, `NouveauCercle`.
- [x] **T7 — i18n** : clés `amis.*`, `cercles.*`, `soiree.*` (invitations), `tabbar.amis`,
  FR et EN.
- [x] **T8 — Tests** : unitaires (`amis-v480.test.ts`, 18 tests) ; E2E parcours complet
  (`amis.spec.ts`) ; aides `devenirAmis` / `devenirAmiDe` dans les parcours à plusieurs
  comptes ; « Programmer » devient « Programmer et inviter ».
- [x] **T9 — Release** : CHANGELOG 4.8.0, version 4.8.0, PR, CI verte, déploiement.
