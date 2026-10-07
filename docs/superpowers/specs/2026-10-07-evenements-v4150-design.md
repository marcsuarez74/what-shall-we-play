# Conception — Événements (v4.15.0)

**Date** : 2026-10-07 · **Statut** : validé par le client (maquette v5 : emplacement B, période facultative,
pas d'invitation par partie, rattachement au démarrage, tout participant rattache ses parties, pas de sondage)
**Maquette validée** : `mockup/2026-10-07-v4150-evenements.html`

## 1. Décisions

- **Emplacement** : sous-onglets « Parties | Événements » en haut de l'onglet Parties
  (`/nights?vue=evenements`) ; la barre du bas garde 5 onglets.
- **Un événement** : titre, description facultative, **période facultative** (« Dates à définir »),
  **participants** (cercles et amis) — ils **voient** l'événement et sont prévenus une fois
  (notification « Invitations »). **Personne n'est invité aux parties** par l'événement.
- **Rattachement au démarrage** : champ « Événement » dans « Nouvelle partie » (prérempli par
  « ▶ Démarrer une partie dans l'événement ») et dans « Modifier la partie » sur l'étagère.
  **Tout participant rattache ses propres parties** (il en est le créateur) ; seuls les joueurs
  de la partie sont comptés.
- **Au programme** (organisateur) : jeux de sa ludothèque, choisis dans une bottom-sheet. Un jeu
  est **coché tout seul** quand une partie de l'événement se termine dessus (calculé, rien à saisir).
- **Pas de sondage de dates** depuis l'événement (le sondage existe pour les parties ordinaires).
- **Supprimer** (organisateur, confirmé) : les parties restent, détachées ; programme et
  participants partent.
- Règles du jeu : le lien BoardGameGeek de la fiche (l'assistant IA #16 reste à part).

## 2. Modèle

```sql
CREATE TABLE evenements (id, creator_id, titre, description, du, au, created_at);
CREATE TABLE evenement_membres (evenement_id, user_id, UNIQUE);
CREATE TABLE evenement_jeux (evenement_id, game_id, UNIQUE);
ALTER TABLE nights ADD COLUMN evenement_id INTEGER REFERENCES evenements(id);
```

## 3. Code

- `lib/evenements.ts` : `creerEvenement`, `mesEvenements`, `getEvenement` (participants seulement),
  `ajouterJeuProgramme` / `retirerJeuProgramme`, `jeuxProgramme` (joué calculé), `partiesEvenement`,
  `rattacher`, `supprimerEvenement`.
- API : `POST /api/evenements`, `DELETE /api/evenements/[id]`, `POST /api/evenements/[id]/jeux`,
  `evenementId` sur `POST /api/nights` et `PATCH /api/nights/[id]`.
- Pages : sous-onglets de `/nights`, `/evenements/[id]` ; composants `NouvelEvenement`, `ProgrammeJeux` ;
  `NightPicker` / `NightPlanner` : champ « Événement ».

## 4. Tests

- Unitaires `tests/unit/evenements-v4150.test.ts` : visibilité, validations, rattachement et gardes,
  coche automatique, programme réservé à l'organisateur, suppression qui détache.
- E2E `tests/e2e/evenements.spec.ts` : parcours complet (création → programme → partie démarrée →
  coche → vue participante → suppression).
