# Conception — Kijoukan (v4.16.0)

**Date** : 2026-10-07 · **Statut** : validé par le client (« je veux que ça reste Kijoukan, sinon OK » : recommandations retenues)
**Maquette validée** : `mockup/2026-10-07-v4160-kijoukan.html`

## 1. Décisions

- **Nom : « Kijoukan »** (« qui joue quand ? » en sous-titre).
- **Une grille par compte** (« ma semaine type ») : 7 jours × **Midi / Soir**. Pas de calendrier
  ni d'exceptions. Réglable **au profil** et **directement sur la carte d'un cercle** (même grille).
- **Carte du cercle** : chaque case montre le nombre de membres dispo (couleur plus chaude),
  ma case est entourée ; toucher une case coche / décoche ma dispo et affiche **qui** (membres du
  cercle seulement). « N membres sur M ont rempli leur semaine type ».
- **Meilleur créneau** (le plus de membres ; le premier en cas d'égalité) → **« Proposer une
  partie jeudi soir »** : le formulaire « Nouvelle partie » s'ouvre en **Plusieurs dates** avec
  les **3 prochaines** occurrences du créneau (12:00 midi, 20:00 soir) et le cercle coché →
  sondage (v4.10.0). Kijoukan n'envoie rien tout seul.

## 2. Modèle

`ALTER TABLE users ADD COLUMN kijoukan TEXT NOT NULL DEFAULT ''` — 14 caractères `0`/`1`
(cases 0–6 : midi du lundi au dimanche ; 7–13 : soir). Vide = rien coché.

## 3. Code

- `lib/kijoukan.ts` : `grilleDe`, `reglerGrille`, `carteCercle`, `meilleurCreneau`, `prochainesDates`.
- `PUT /api/me/kijoukan { grille }` (400 si format invalide).
- `components/KijoukanGrille.tsx` (profil et cercle) ; `NightPicker` / `NightPlanner` : `datesInit`,
  `cerclesInit` (sondage prérempli).

## 4. Tests

- Unitaires `tests/unit/kijoukan-v4160.test.ts` : grille, validation, carte (sommes, noms, répondu),
  meilleur créneau, prochaines dates (jamais aujourd'hui).
- E2E `tests/e2e/kijoukan.spec.ts` : profil → carte du cercle → meilleur créneau → sondage prérempli envoyé.
