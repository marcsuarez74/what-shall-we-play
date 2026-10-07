# Notifications push (v4.9.0) — Plan d'implémentation

**Spec** : `docs/superpowers/specs/2026-10-07-notifications-v490-design.md`
**Maquette** : `mockup/2026-10-07-v490-notifications.html`

## Contraintes

- Une dépendance : `web-push`. Envoi jamais bloquant, jamais d'échec d'action à cause d'un push.
- Chaînes FR + EN (UI et textes de notification) ; textes dans la langue du destinataire.

## Tâches

- [x] **T1 — Données** : `push_abonnements`, `users.notif_off`, `nights.rappel_envoye`.
- [x] **T2 — `lib/push.ts`** : clés VAPID (env ou `DATA_DIR/vapid.json`), abonnements,
  préférences, `notifier`, rappels dus.
- [x] **T3 — Branchements** : invitations, réponses, amis / cercles ; balayage des rappels
  dans `instrumentation.ts`.
- [x] **T4 — API** `/api/push` (GET, POST, DELETE, PATCH).
- [x] **T5 — Service worker** : `push`, `notificationclick`.
- [x] **T6 — UI** : carte Notifications au profil (N1/N2/N3), bandeau sur Parties (N4).
- [x] **T7 — Tests** : unitaires `push-v490`, E2E carte du profil.
- [x] **T8 — Release** : CHANGELOG, version 4.9.0, PR.
