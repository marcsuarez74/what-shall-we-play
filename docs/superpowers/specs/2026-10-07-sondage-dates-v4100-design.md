# Conception — Nouvelle partie unifiée et sondage de dates (v4.10.0)

**Date** : 2026-10-07 · **Statut** : validé par le client
**Maquette validée** : `mockup/2026-10-07-v4100-sondage-dates.html` (version 3)

## 1. Décisions

- **Un seul formulaire « Nouvelle partie »** (étagère vide et Parties) : titre, **Quand ?**
  (Maintenant · Une date · Plusieurs dates), **Qui ?** (cercles puis amis, mêmes listes).
  - *Maintenant* : partie du jour, inscription directe (comportement actuel).
  - *Une date* : partie programmée, invitations Dispo / Pas dispo (v4.8.0).
  - *Plusieurs dates* : **sondage**. Depuis l'étagère, « Maintenant » est présélectionné ;
    depuis Parties, « Une date ». Le bouton « ＋ Programmer une partie » devient
    « ＋ Nouvelle partie ».
- **Sondage** : 2 à 6 dates (heure facultative), invités = cercles et amis cochés.
  Chacun coche les dates où il est dispo (dispo ou pas, pas de « peut-être »),
  modifiable tant que le sondage est ouvert. Réponses visibles de tous les invités.
  L'organisateur compte comme dispo partout.
- **Retenir un ou plusieurs soirs** (organisateur) : une partie programmée **par soir
  retenu**, même titre ; pour ce soir : dispo → joueurs (invitation « dispo »),
  « non » → invitation « Pas dispo » (modifiable), sans réponse → invitation en
  attente. Le sondage est alors fermé (supprimé). L'organisateur peut aussi
  supprimer le sondage (confirmé) ; aucune partie n'est touchée.
- Pas d'échéance automatique.
- **Notifications** (type « Invitations ») : à l'envoi du sondage ; au choix, « tu joues »
  pour les dispo, invitation classique pour les sans-réponse.
- **Pastille Parties** : invitations sans réponse + sondages sans réponse.

## 2. Modèle

```sql
CREATE TABLE sondages (id, creator_id → users, titre, created_at);
CREATE TABLE sondage_dates (id, sondage_id → sondages ON DELETE CASCADE, played_at, start_time);
CREATE TABLE sondage_invites (sondage_id, user_id, via_cercle, UNIQUE (sondage_id, user_id));
CREATE TABLE sondage_reponses (date_id → sondage_dates ON DELETE CASCADE, user_id, dispo 0|1,
  UNIQUE (date_id, user_id));
```
« A répondu » = au moins une ligne de réponse ; à la première réponse, toutes les dates
reçoivent une ligne (0), puis la date touchée passe à 1.

## 3. Serveur

`lib/sondages.ts` : `creerSondage`, `repondreSondage`, `sondagesInvite`, `sondagesOrganises`,
`retenirDates`, `supprimerSondage`, `nbSondagesSansReponse`. API `/api/sondages` (POST),
`/api/sondages/[id]` (DELETE), `/api/sondages/[id]/reponse` (POST), `/api/sondages/[id]/retenir` (POST).

## 4. Tests

Unitaires : bornes de dates, invités filtrés aux relations, réponse (toutes dates créées,
bascule), visibilité, retenir 1 ou 2 soirs (joueurs / Pas dispo / attente, sondage fermé),
supprimer, pastille. E2E : formulaire unifié (trois modes), parcours sondage → réponse → deux soirs retenus.
