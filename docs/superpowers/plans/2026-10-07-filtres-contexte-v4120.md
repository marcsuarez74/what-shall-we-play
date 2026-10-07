# Filtres de contexte (v4.12.0) — Plan d'implémentation

**Spec** : `docs/superpowers/specs/2026-10-07-filtres-contexte-v4120-design.md`
**Maquette** : `mockup/2026-10-07-v4120-filtres-contexte.html`

## Contraintes

- Aucun composant, aucune table, aucune dépendance : on branche l'existant.
- Chaînes FR + EN. Accroches E2E existantes (`.fam`, `.fchip`, `.shelf-count`, `.choix-pool`) gardées.

## Tâches

- [x] **T1 — `lib/filters.ts`** (TDD) : durée 4 plages, `filtresActifs`.
- [x] **T2 — `ShelfControls`** : puces de durée, « Durée (min) », suggestion « Vous êtes N ».
- [x] **T3 — `ShelfClient`** : pool filtré (hors recherche), comptes Tous / Votés, Lancer · N,
  bouton désactivé à 0, ligne « Filtres actifs ».
- [x] **T4 — i18n** FR + EN.
- [x] **T5 — E2E** : `filtres-tirage.spec.ts` ; mise à jour de `etagere-ajouts.spec.ts`.
- [x] **T6 — Release** : 4.12.0, CHANGELOG, vérifications, PR.
