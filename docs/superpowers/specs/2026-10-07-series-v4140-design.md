# Conception — Parties récurrentes et conflit d'horaire (v4.14.0)

**Date** : 2026-10-07 · **Statut** : validé par le client (« v4.14 ok » : recommandations retenues)
**Maquette validée** : `mockup/2026-10-07-v4140-parties-recurrentes.html` (écrans S1, S2, S3, S5 ; S4 = v4.14.1)

## 1. Décisions

- **« 🔁 Répéter »** s'ajoute à « Une date » dans « Nouvelle partie » : **chaque semaine** ou
  **toutes les 2 semaines**, même jour, même heure, même titre. Pas de « 1ᵉʳ jeudi du mois ».
- Chaque date est une **partie programmée ordinaire** (étagère, invitations Dispo / Pas dispo,
  rappel push, .ics) reliée à sa série (`nights.serie_id`).
- **4 dates d'avance**. La suivante est créée **au fil de l'eau** (`completerSeries`, à
  l'affichage de Parties et dans le balayage des rappels toutes les 5 min) — pas de tâche dédiée.
  Les nouvelles dates reprennent les invités de la dernière date. Seule la première date
  notifie (push « invitation ») : pas une notification par semaine.
- **Carte de la série** dans Parties (section « Séries ») : les dates à venir, ma réponse
  **par date** (« Dispo ? » / « Dispo ✓ » / « Pas dispo »), « **Dispo à toutes** », lien vers
  l'étagère de chaque date. Les dates d'une série ne s'affichent plus une à une dans
  Invitations ni dans Programmées.
- **Conflit d'horaire** : une autre partie non terminée le même jour où je joue, à moins de
  **3 h** d'écart (ou sans heure d'un côté) → alerte « ⚠ Tu joues déjà ce jour-là : « … » » sur
  la carte d'invitation, la carte programmée et la ligne de série. **Jamais bloquant.**
- **Gérer la série** (créateur) : modifier titre / heure de **toutes les dates à venir** ; une
  date seule se modifie comme avant (étagère › Modifier). **Arrêter la série** : la confirmation
  liste ce qui part (dates à venir sans étagère : supprimées) et ce qui reste (dates dont
  l'étagère est préparée : gardées, détachées ; parties jouées : intactes).

## 2. Modèle

```sql
CREATE TABLE series (id, creator_id → users CASCADE, pas IN (1, 2), arretee, created_at);
ALTER TABLE nights ADD COLUMN serie_id INTEGER REFERENCES series(id);
```

## 3. Serveur

- `lib/series.ts` : `creerSerie`, `completerSeries`, `occurrencesAVenir`, `mesSeries`,
  `dispoATous`, `modifierSerie`, `bilanArret`, `arreterSerie`, `ajouterJours` (UTC).
- `lib/nights.ts` : `conflitHoraire(userId, night)`.
- `lib/invitations.ts` : `inviter(..., push = true)` ; `mesInvitations` exclut les dates de série.
- API : `POST /api/nights { …, repeter: 1 | 2 }`, `POST /api/series/[id]/dispo`,
  `PATCH /api/series/[id] { titre?, startTime? }`, `DELETE /api/series/[id]`.

## 4. Tests

- Unitaires `tests/unit/series-v4140.test.ts` : dates, pas de 2 semaines, complétion idempotente,
  Dispo à toutes, état par date, modification, arrêt (supprimées / gardées), conflit ±3 h.
- E2E `tests/e2e/series.spec.ts` : Répéter → 4 dates → Dispo à toutes → conflit → arrêt.
