# Conception — Notifications push (v4.9.0)

**Date** : 2026-10-07 · **Statut** : validé par le client (« ok go »)
**Maquette validée** : `mockup/2026-10-07-v490-notifications.html` (version 1, points 1 à 6 retenus tels quels)

## 1. Décisions

- Push web standard (Web Push + VAPID), via la dépendance `web-push` (chiffrement des
  messages : non trivial à refaire, d'où l'exception à « zéro dépendance »).
- **Quatre types**, chacun réglable au profil (préférence du compte, tous activés par défaut) :
  1. `invitations` — on m'invite à une partie programmée → `/nights` ;
  2. `reponses` — Dispo / Pas dispo à une partie que j'organise → `/nights` ;
  3. `rappel` — jour J, joueurs inscrits : à 10 h, ou 2 h avant l'heure prévue si c'est
     plus tard → l'étagère de la partie ;
  4. `amis` — demande d'ami reçue, demande d'adhésion à valider (admins), ajouté à un
     cercle → `/amis` (ou le cercle).
- **Activer** : au profil (bouton → permission du navigateur → abonnement de l'appareil).
  Bloquées par le navigateur : explication. iPhone hors app installée : explication.
- **Bandeau** sur Parties quand j'ai une invitation et que l'appareil n'est pas abonné ;
  ✕ le masque pour de bon sur cet appareil (`localStorage`).
- Un abonnement **par appareil** ; « Désactiver sur ce téléphone » ne touche que lui.
- Pas de fil de notifications dans l'app. Une réponse remplace la précédente pour la même
  partie (`tag` de notification).
- Texte de la notification dans la langue du destinataire (`users.lang`).
- **Clés VAPID** : variables d'environnement `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` si
  présentes, sinon générées une fois et gardées dans `DATA_DIR/vapid.json` (aucune
  configuration de déploiement requise ; elles survivent aux redéploiements avec la base).
- Envoi **jamais bloquant** : une erreur d'envoi n'échoue aucune action ; un abonnement
  expiré (404/410) est supprimé.

## 2. Modèle

```sql
CREATE TABLE push_abonnements (endpoint TEXT PRIMARY KEY, user_id → users ON DELETE CASCADE,
  p256dh TEXT, auth TEXT, created_at);
ALTER TABLE users ADD COLUMN notif_off TEXT NOT NULL DEFAULT '';  -- types coupés, « reponses,amis »
ALTER TABLE nights ADD COLUMN rappel_envoye INTEGER NOT NULL DEFAULT 0;
```

## 3. Serveur

- `lib/push.ts` : `clesVapid()`, `abonner`, `desabonner`, `prefsNotif`, `reglerNotif`,
  `notifier(userIds, type, message)` (filtre par préférence, envoi asynchrone),
  `rappelsDus(maintenant)` + `envoyerRappels()` (balayage toutes les 5 min,
  `instrumentation.ts`).
- Branchements : `inviter` (invitations), `repondre` (reponses → organisateur),
  `demanderAmi` (amis, demande seulement), `ajouterMembre` / `rejoindreParLien`
  (amis : admins si en attente, la personne ajoutée sinon).
- API `/api/push` : GET (clé publique + préférences), POST (abonner l'appareil),
  DELETE (désabonner), PATCH (`{ type, actif }`).
- Service worker : `push` (affiche, `tag`) et `notificationclick` (ouvre ou focalise l'URL).

## 4. Tests

- Unitaires : préférences, abonnement, filtrage par type, heure du rappel (10 h / 2 h
  avant), rappel envoyé une seule fois, abonnement expiré supprimé (envoi simulé).
- E2E : carte du profil (activer refusé → explication, réglages par type persistés).
