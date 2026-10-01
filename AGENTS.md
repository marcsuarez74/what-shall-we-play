# AGENTS.md — What Shall We Play?

Principes de travail pour tout agent (ou humain) intervenant sur ce dépôt.
PWA Next.js de tirage au sort du jeu du soir — https://etagere.marc-suarez.fr

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
- Chaîne obligatoire : branche → PR → CI verte (3 jobs) → fusion → déploiement →
  tag annoté → release GitHub → vérifier la prod (`curl -s https://etagere.marc-suarez.fr/sw.js | grep -o "wsp-v[0-9.]*"`).
- Jamais de commit direct sur main. Jamais de force-push.

## 3. Documentation
- Toute version a son entrée dans `CHANGELOG.md` (français, format Keep a Changelog).
- Les décisions, arbitrages et rulings sont consignés au ledger
  `.superpowers/sdd/<projet>/progress.md` (local, git-ignoré).
- Tout design nouveau passe par une **maquette HTML autonome validée** par le client
  avant le code (dossier `.superpowers/brainstorm/<session>/content/`) —
  exception : retouches et corrections explicites (« pas besoin de maquette »).
- Les règles de conduite E2E et les accroches stables (`aria-label`, hooks de test)
  sont une interface : ne pas les casser sans mettre à jour les tests dans le même commit.

## 4. Garde-fous du projet
- UI 100 % français, palette noyer/crème/cuivre, Bricolage Grotesque + Space Grotesk.
- Suite verte avant toute release : `npx vitest run` + `npx playwright test` + `npx tsc --noEmit`.
- Une donnée n'est jamais détruite implicitement (suppressions explicites et confirmées).
