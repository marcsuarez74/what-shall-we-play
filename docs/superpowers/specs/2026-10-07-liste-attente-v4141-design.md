# Conception — Places max et liste d'attente (v4.14.1)

**Date** : 2026-10-07 · **Statut** : validé par le client (maquette v4.14, écran S4 ; livraison en 2 temps retenue)
**Maquette validée** : `mockup/2026-10-07-v4140-parties-recurrentes.html` (S4)

## 1. Décisions

- **Places max facultatives** (2 à 30) à la création d'une partie programmée — et d'une série :
  chaque date en hérite. Sans valeur : illimité, rien ne change.
- Partie **complète** (joueurs, hôte compris, ≥ places max) : le bouton d'invitation devient
  **« Me mettre en attente »** et la carte l'explique. Entrer en liste n'est pas jouer.
- **Promotion automatique** : quand un joueur passe « Pas dispo », le premier de la liste devient
  joueur et reçoit la notification « Une place s'est libérée — tu joues ! » (type Invitations).
- « Pas dispo » depuis la liste : on en sort, sans rien promouvoir.
- L'organisateur voit « n/max · complet » et « k en attente » ; il peut toujours inscrire
  lui-même un invité (il dépasse alors la limite : c'est son choix).

## 2. Modèle

```sql
ALTER TABLE nights ADD COLUMN places_max INTEGER;        -- NULL = illimité
ALTER TABLE night_invites ADD COLUMN en_liste TEXT;       -- entrée en liste (NULL = pas en liste)
```

L'état d'invitation reste `attente` pendant la liste : la contrainte `CHECK` de `etat` n'est pas
touchée (pas de reconstruction de table).

## 3. Code

- `lib/invitations.ts` : `listeAttente`, promotion dans `repondre` (réponse `{ ok, liste: rang }`
  quand on entre en liste), `rang_liste` dans `mesInvitations`.
- `createNight(..., { placesMax })`, `creerSerie(..., { placesMax })` (les dates suivantes héritent).
- `POST /api/nights { placesMax }` (400 hors de 2–30). Champ « Places max » dans `NightPicker`.

## 4. Tests

- Unitaires `tests/unit/liste-attente-v4141.test.ts` : illimité, ordre de la liste, promotion,
  sortie de liste, héritage dans une série.
- E2E `tests/e2e/liste-attente.spec.ts` : 400 hors bornes, complet → en attente → décompte hôte →
  désistement → promotion.
