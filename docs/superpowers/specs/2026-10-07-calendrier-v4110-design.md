# Conception — Ajout au calendrier (v4.11.0)

**Date** : 2026-10-07 · **Statut** : validé par le client (« ok pour 3 h, on garde le rappel push, on voit plus tard »)
**Maquette validée** : `mockup/2026-10-07-v4110-calendrier.html`

## 1. Décisions

- Un bouton **📅 Ajouter à mon calendrier** télécharge un fichier `.ics` généré par le serveur
  (une route de plus). Rien n'est stocké, aucune dépendance : le fichier est un texte.
- **Où** : sur la carte d'une partie **programmée** (page Parties) et juste après la réponse
  « Dispo » à une invitation. Pas de bouton sur la partie du jour (« Maintenant ») ni sur une
  partie terminée.
- **Contenu** : titre de la partie (repli sur la date, comme partout), date, heure, joueurs
  (comptes + invités), lien vers l'étagère de la partie (`/etagere?night=<id>`, qui exige d'être
  connecté — jamais le lien d'invitation, qui donne l'accès à la partie).
- **Avec une heure** : durée par défaut **3 h** (l'app ne connaît pas la fin). Heure « flottante »
  (sans fuseau) : 20:00 reste 20:00 dans l'agenda de chacun, comme dans l'app.
  **Sans heure** : événement « toute la journée ».
- **Mise à jour plutôt que doublon** : `UID` stable (`night-<id>@what-shall-we-play`) et
  `SEQUENCE` croissant (minutes depuis 1970) : rouvrir le fichier après un changement d'heure
  met l'événement à jour.
- **Pas d'alarme** dans le fichier : le rappel push du jour J (v4.9.0) existe déjà.
- **Pas d'abonnement** (flux synchronisé de toutes mes parties) : hors périmètre.
- Les textes du fichier suivent la langue du compte (FR / EN).

## 2. Serveur

- `lib/ics.ts` — pur, sans accès base : `genererIcs({ night, joueurs, url, titre, lang, maintenant })`
  → chaîne `text/calendar` (fins de ligne CRLF, échappement `\ , ;` et retours à la ligne,
  repli des lignes à 75 octets). Calcul de fin en arithmétique de chaînes (indépendant du
  fuseau du serveur, y compris le passage minuit).
- `GET /api/nights/[id]/ics` : 401 non connecté ; 404 partie introuvable **ou inaccessible**
  (même réponse : on ne révèle rien) ; 409 partie terminée ou du jour ; sinon
  `200` `text/calendar; charset=utf-8`, `Content-Disposition: attachment; filename="<slug>.ics"`,
  `Cache-Control: no-store`.
- Accès = `userCanAccessNight` (créateur ou joueur ; les invités par lien sont des joueurs).

## 3. Interface

- Lien `<a href="/api/nights/<id>/ics" download>` : zéro JavaScript côté client (KISS, rien à
  charger en plus). Composant serveur `AjoutCalendrier`.
- Carte programmée : à côté de « Préparer l'étagère » / « Inviter ».
- Carte d'invitation, état « Dispo » : phrase « Tu joues ! » + le lien.
- Chaînes FR + EN dans `lib/i18n/`.

## 4. Tests

- Unitaires (`tests/unit/ics-v4110.test.ts`) : en-têtes et CRLF, échappement, repli à 75 octets,
  « toute la journée » (`VALUE=DATE`, fin = lendemain), heure + 3 h, passage minuit, `UID` stable,
  `SEQUENCE` croissant, joueurs dans la description, langue EN.
- E2E (`tests/e2e/calendrier.spec.ts`) : partie programmée → le lien existe, le téléchargement
  renvoie un `.ics` valide ; un compte étranger reçoit 404 ; pas de lien sur la partie du jour.

## 5. Hors périmètre

Abonnement calendrier, alarmes, adresse du lieu (l'app n'en a pas), export de plusieurs parties.
