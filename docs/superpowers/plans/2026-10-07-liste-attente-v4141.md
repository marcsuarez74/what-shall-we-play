# Places max et liste d'attente (v4.14.1) — Plan d'implémentation

**Spec** : `docs/superpowers/specs/2026-10-07-liste-attente-v4141-design.md`

## Tâches

- [x] **T1 — Données** : `nights.places_max`, `night_invites.en_liste`.
- [x] **T2 — `lib/invitations.ts`** (TDD) : liste, promotion, rang.
- [x] **T3 — Création** : `placesMax` (API, `createNight`, séries).
- [x] **T4 — UI** : champ « Places max », carte d'invitation (complet / rang), décompte hôte, ligne de série.
- [x] **T5 — i18n** FR + EN.
- [x] **T6 — Tests** : unitaires, E2E `liste-attente.spec.ts` ; `series.spec.ts` cible le champ titre.
- [x] **T7 — Release** : 4.14.1, CHANGELOG, PR.
