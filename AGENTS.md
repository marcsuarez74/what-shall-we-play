# AGENTS.md — What Shall We Play?

Principes de travail pour tout agent (ou humain) intervenant sur ce dépôt.
PWA Next.js de tirage au sort de la partie du jour — https://what-shall-we-play.marco-studio.fr

## 1. Principe KISS (fondamental)
- La solution la plus simple qui fait le travail, toujours.
- Pas d'abstraction, de dépendance ou d'étape supplémentaire sans nécessité démontrée.
- Une demande = un périmètre : ne pas en profiter pour refondre ce qui n'est pas demandé.
- Avant d'ajouter, chercher ce qu'on peut retirer.

## 2. Releases
- Toute demande livrée donne lieu à une release, calibrée selon la demande :
  - **MAJOR** : changement de comportement ou de flux, cassant pour l'existant
  - **MINOR** : nouvelle fonctionnalité
  - **PATCH** : correction ou retouche cosmétique
- Chaîne obligatoire : branche → PR → CI verte (4 jobs, dont la détection docs-only ;
  build et tests ne tournent que sur la PR, branche à jour avec main exigée) →
  fusion → déploiement (seul job de la CI sur main) → tag annoté `v<version de package.json>`
  et release GitHub, **automatiques** après le déploiement (ne pas les créer à la main ;
  oublier d'incrémenter la version = pas de release) → vérifier la prod
  (`curl -s https://what-shall-we-play.marco-studio.fr/sw.js | grep -o "wsp-v[0-9.]*"`).
- **Toujours passer par une Pull Request — sans exception**, y compris pour les
  changements de docs (le fait d'être admin qui bypass les required checks ne
  dispense pas de la PR : c'est elle qui porte l'historique et la relecture).
- Jamais de commit direct sur main. Jamais de force-push.

## 3. Documentation
- Toute version a son entrée dans `CHANGELOG.md` (français, format Keep a Changelog).
- Les décisions, arbitrages et rulings sont consignés au ledger
  `.superpowers/sdd/<projet>/progress.md` (local, git-ignoré).
- Tout design nouveau passe par une **maquette HTML autonome validée** par le client
  avant le code, versionnée dans `mockup/` (`AAAA-MM-JJ-v<version>-<sujet>.html`,
  indexée dans `mockup/README.md`) — exception : retouches et corrections explicites
  (« pas besoin de maquette »).
- Les règles de conduite E2E et les accroches stables (`aria-label`, hooks de test)
  sont une interface : ne pas les casser sans mettre à jour les tests dans le même commit.

## 4. Garde-fous du projet
- **UI française par défaut, anglais supporté** (sélecteur FR/EN, cookie `wsp_lang`,
  dictionnaires typés dans `lib/i18n/` — toute nouvelle chaîne passe par les dicts),
  palette noyer/crème/cuivre, Bricolage Grotesque + Space Grotesk.
- Suite verte avant toute release : `npx vitest run` + `npx playwright test` + `npx tsc --noEmit`.
- Une donnée n'est jamais détruite implicitement (suppressions explicites et confirmées).
