# Conception — Invités par lien, refonte (v4.7.0)

**Date** : 2026-10-06 · **Statut** : validé par le client
**Maquette validée** : `mockup/2026-10-06-v470-invites-refonte.html`
**Remplace** : le parcours invité de la v4.6.0 (`2026-10-06-invites-cercles-design.md` §4.1) ;
les cercles passent en v4.8.0.

## 1. Retours client sur la v4.6.0

| Constat | Cause |
|---|---|
| Les joueurs qui ont rejoint une partie programmée « n'apparaissent pas » | L'invité était envoyé sur `/etagere`, qui ne montre que la partie du jour : page vide pour une partie programmée. La page Parties n'avait pas de synchro live. |
| Lien seulement sur les parties programmées | Le bouton n'existait que sur les cartes programmées. |
| Impossible de poser des jeux à l'avance | L'étagère n'existait que pour la partie du jour. |
| Liste programmée collée au bouton « Programmer » | Marge manquante. |
| L'invité accède au profil et à toute l'app | Une session invité était une session comme une autre. |
| Les invités sont proposés dans les nouvelles parties | La liste des joueurs prenait tous les `users`. |

## 2. Décisions (validées)

- **L'invité ne voit que sa soirée** : titre, date, heure, organisateur, joueurs, étagère
  (rayons par format, comme l'app) et vote. Il peut **se retirer** (confirmé) ou **créer
  son compte** (même identité : votes et soirée conservés). Ni onglets, ni profil, ni ajout
  de jeux, ni ludothèque.
- **En jeu / terminée** : l'invité voit le jeu sorti puis le résultat, en **lecture seule**.
  L'hôte saisit toujours ses scores.
- **Un invité = une soirée.** Un second lien crée un second invité ; pour suivre plusieurs
  soirées, il crée un compte.
- **Invités jamais proposés** comme joueurs (sélecteurs de partie, `/api/users`).
- **Lien d'invitation sur toute partie non terminée** (ce soir comme programmée).
- **Étagère d'une partie programmée** (`/etagere?night=<id>`) : ajouts et votes à l'avance,
  tirage et sortie de boîte refusés avant le jour J (serveur et UI).
- **Titre facultatif** d'une partie (40 caractères), saisi à la programmation, modifiable
  par le créateur ; repli d'affichage « Partie du jeudi 9 octobre ». Il ouvre le message
  WhatsApp.
- **Supprimer une partie programmée** : créateur seulement, confirmation qui liste ce qui
  part (joueurs prévenus, invités et leurs votes supprimés, jeux retirés de l'étagère —
  ils restent dans les ludothèques).
- **Joueurs et invités séparés** sur l'étagère du créateur (chips en pointillé cuivre, badge
  INVITÉ(E), ✕ pour retirer). Les invités ne « valident » pas de sélection.
- Version **v4.7.0** (MINOR : le comportement invité change mais aucun flux compte ne casse).

## 3. Modèle

```sql
ALTER TABLE nights ADD COLUMN titre TEXT; -- facultatif, NULL = repli sur la date
```

Aucune autre table. L'invité reste une ligne `users` (`est_invite = 1`) liée à une seule
soirée par `night_players`.

## 4. Accès : refus par défaut

- `getSessionUser()` **ne renvoie plus les invités** : toutes les pages et routes existantes
  les traitent comme non connectés (pages → `/login` → `/invite`).
- `getSessionAny()` : réservé aux routes qu'un invité utilise — vote, sync live
  (`/api/me/events`), langue.
- `getSessionInvite()` : `/invite`, `/api/invite/retirer`, `/api/invite/compte`.

## 5. Écrans

| Écran | Route |
|---|---|
| Invitation (avant de rejoindre) | `/nights/<id>/rejoindre?k=` — qui invite, titre, date, résumé ; prénom, ou « Me connecter et rejoindre » (`/login?next=`) |
| Soirée de l'invité | `/invite` — sans onglets ; vote ; « Créer mon compte » ; « Se retirer de la soirée » |
| Étagère d'une partie | `/etagere?night=<id>` — badge Programmée, joueurs / invités, lien, tirage le jour J |
| Parties | `/nights` — titre, nombre de jeux, « Préparer l'étagère », « 🔗 Inviter », « Supprimer » ; synchro live |

## 6. Tests

- **Unitaires** (`tests/unit/invites-v470.test.ts`) : titre (normalisation, modification
  créateur), partie programmée (ajout oui, tirage/boîte non), invité restreint (soirée unique,
  absent des comptes, retrait par lui-même, pas d'un autre), conversion en compte (même ligne,
  refus des pseudos invalides ou pris), suppression (créateur seulement, invités emportés).
- **E2E** (`tests/e2e/invite.spec.ts`) : parcours complet de la maquette — programmation
  titrée, étagère à l'avance, invitation, vue restreinte, vote, retrait, conversion,
  suppression, lien mort.
