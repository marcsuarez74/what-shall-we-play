# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Shall We Play?

PWA Next.js de tirage au sort de la partie du jour — https://what-shall-we-play.marco-studio.fr

Ce fichier a un seul but : **te faire gagner du temps de travail**. Les règles obligatoires
(KISS, PR obligatoire, maquettes, données jamais détruites) vivent dans **AGENTS.md** —
lis-le d'abord, ne les duplique pas ici. Ci-dessous : la carte du dépôt, le coût réel des
vérifications et les pièges déjà payés une fois.

## La règle la plus rentable

**Ce dépôt vit avec plusieurs sessions d'agents en parallèle.** Ton contexte périt vite :
- `git fetch origin` **avant tout** — `main` bouge plusieurs fois par jour, et ta branche
  peut avoir reçu des commits d'une autre session (cas réel : un lot entier livré ailleurs
  pendant qu'un plan était écrit).
- Avant de commencer : `gh pr list` + `git log origin/main..<ta branche> --oneline`.
- Avant d'ouvrir une PR : ta branche doit contenir `origin/main` (CI exigeante) —
  `git merge origin/main` (jamais de rebase : pas de force-push).

## Carte du dépôt

| Chemin | Rôle |
|---|---|
| `docs/superpowers/plans/` · `specs/` | un fichier daté par chantier ; le plan s'exécute, la spec fait foi |
| `mockup/` (+ `mockup/README.md`) | maquettes HTML versionnées — **HARD-GATE** : validation client avant le code (exception : retouches explicites) |
| `.superpowers/sdd/<chantier>/progress.md` | ledgers **locaux, git-ignorés** : décisions, rulings, accès VPS, état en cours |
| `futur-feature.md` | backlog produit |
| `CHANGELOG.md` + `package.json` | une entrée par version (français) ; la version est la source du tag |

## Commandes

`npm run dev` (turbopack) · `npm run build` · `npm run lint` (ESLint 9 flat, pas de Prettier) ·
`npm test` (vitest) · `npm run test:e2e` (playwright) · typage : `npx tsc --noEmit` (pas de script).
Un seul test : `npx vitest run tests/unit/<f>.test.ts -t "<nom>"` ·
`npx playwright test tests/e2e/<spec>.spec.ts -g "<nom>"`.

## Architecture (ce qui demande plusieurs fichiers pour être compris)

- **Next 15 App Router, React 19, sans server actions** : toutes les mutations passent par
  `app/api/**/route.ts`. **Pas de `middleware.ts`** : chaque page/route vérifie elle-même
  la session (`getSessionUser` / `getSessionAny` / `getSessionInvite`, `lib/session.ts`).
- **Domaine dans `lib/*.ts`** (nights, libre, draw, wheel, manches, games, foyers, sondages…),
  composants client dans `components/`. Toute chaîne UI passe par `lib/i18n/{fr,en}.ts`
  (dictionnaires typés : une clé ajoutée en FR doit l'être en EN).
- **Persistance : better-sqlite3 brut, aucun ORM** (`lib/db.ts`). `DATA_DIR` → `app.db` (WAL).
  Schéma en `CREATE TABLE IF NOT EXISTS` ; migrations dans `runMigrations` (`ALTER` tolérés
  par try/catch, étapes versionnées par `PRAGMA user_version`) ; `purger()` au démarrage.
- **Auth maison** : pseudo + PIN 4 chiffres (bcrypt, `lib/auth.ts`), cookie `wsp_session`,
  jeton d'appareil « se souvenir de moi » avec rotation (`/api/auth/restore`). Invités :
  `users.est_invite=1`, limités à leur soirée. Rate-limit login en mémoire (`lib/limite.ts`).
- **Temps réel : SSE** `app/api/me/events/route.ts` + bus en mémoire `lib/events.ts`
  (`emitToUsers` après une mutation) → `components/UserSync.tsx` fait `router.refresh()`.
  Le bus est sur `globalThis` : **mono-processus uniquement**.
- **Tâches de fond** : `instrumentation.ts` (balayage toutes les 5 min : séries, rappels push).
- **Service worker** généré par `app/sw.js/route.ts` depuis `package.json` : cache
  `wsp-v<version>` — bumper la version invalide le cache client.
- **Soirée** : `nights.mode` ∈ `'tirage' | 'libre'`. Tirage pondéré `lib/draw.ts` + roue
  `lib/wheel.ts` ; choix libre et manches dans `lib/libre.ts` / `lib/manches.ts`.
- **Tests** : vitest en env node, `fileParallelism: false`, `DATA_DIR=.tmp-vitest` (setup).
  Playwright lance aussi un stub BGG (`tests/e2e/bgg-stub.cjs`, :8765) ; helpers réutilisables
  dans `tests/e2e/helpers/` (inscription, amis, shelf/`lancerTirage`).

## Coût réel des vérifications (mesuré)

| Commande | Durée | Quand |
|---|---|---|
| `npx vitest run tests/unit/<fichier>.test.ts` | 2-5 s | boucle TDD |
| `npx vitest run` (250 tests) | ~45 s | avant chaque commit |
| `npx tsc --noEmit` | ~10 s | avant chaque commit |
| `npx playwright test tests/e2e/<spec>.spec.ts` | 1-2 min | pendant le dev, specs ciblées |
| `npx playwright test` (113 tests, serveur dev) | ~6 min local | à éviter pour la suite complète |
| `E2E_PROD=1 npx playwright test` (build de prod) | ~2 min local | **une fois** avant la PR (c'est le mode de la CI) |

Ne lance jamais la suite E2E complète en boucle : c'est la ressource la plus chère du projet,
et c'est la **CI GitHub qui arbitre** (environnement propre).

## E2E : le protocole anti-flake (payé une fois, ne pas repayer)

- `workers: 1` — toute la suite partage **un** serveur dev et **une** base SQLite. La base
  (`os.tmpdir()/wsp-e2e-data`) n'est purgée qu'au démarrage **à froid** du serveur de test.
- `reuseExistingServer: true` : un serveur **orphelin** sur :3000 est adopté **avec sa base
  périmée** (échecs incompréhensibles garantis). Avant un run :
  `lsof -nP -iTCP:3000 -sTCP:LISTEN` et tue l'orphelin.
- `E2E_PROD=1` lance `next build` puis `next start` : un orphelin sur :3000 serait adopté
  tel quel (dev ou ancien build, donc code périmé) — même règle, tue-le avant. Le build
  réécrit `.next/` : n'enchaîne pas pendant qu'un `npm run dev` du même dossier tourne.
- Le port **3000 est réservé aux E2E**. Un serveur de démo/manip : `npm run dev -- -p 3100`
  (voire avec `DATA_DIR` temporaire pour isoler).
- Un test échoue en suite complète ? **Relance sa spec seule.** Si verte → flake de charge
  locale (plusieurs serveurs + navigateurs ouverts) — note-le et laisse la CI trancher.
  Ne débogue pas un fantôme : investigue seulement si l'échec se reproduit seul.
- Pistes connues de flake : flux longs multi-étapes (timing), quota de login
  **20 échecs / IP / 15 min partagé par toute la suite** (même `127.0.0.1`, un seul
  processus) — un `login.spec` rouge en suite complète peut être le voisin qui a épuisé
  le quota ; la limite est **en mémoire**, un serveur froid la remet à zéro.
- Traces des échecs : `test-results/<test>/trace.zip` → `npx playwright show-trace <fichier>`
  (réseau, actions, screencasts — les corps de requête/réponse n'y sont pas).

## Navigateur interactif (démo, revue, debug)

- `playwright-cli` est installé **globalement** : `open / goto / click / eval / requests /
  run-code…` (voir le skill playwright-cli). snapshots lisibles, réseau inclus.
- Deux comptes en même temps : deux sessions `playwright-cli -s=a …` et `-s=b …`
  (deux contextes = deux cookies, comme les specs multi-joueurs).
- Code PIN de **tous les comptes de test : 1234**. Pseudos : préfixe + horodatage base 36.

## Release : tout est automatique, ne rien faire à la main

1. branche → PR → CI verte (build + tests **sur la PR seulement**, branche à jour exigée) ;
2. fusion ;
3. la CI sur `main` déploie, puis pose le tag `v<version de package.json>` et crée la
   release GitHub depuis le CHANGELOG — **automatiquement** ;
4. vérifier la prod : `curl -s https://what-shall-we-play.marco-studio.fr/sw.js | grep -o "wsp-v[0-9.]*"`.

- **Oublier d'incrémenter `package.json` = pas de release.** Tag ou release à la main = interdit.
- PR docs-only : la détection saute build/tests (CI rapide) et, sans bump de version, pas de
  release (précédent : PR #65).

## Prod et débogage

- L'app écoute sur `127.0.0.1:3000` derrière Caddy (HTTPS devant, IP client transmise) ;
  Docker ne publie plus rien sur Internet (audit v4.7.2).
- Accès SSH au VPS, infra, secrets : **ledger local `.superpowers/` (git-ignoré)** — jamais
  d'IP, de clé ou de secret dans un fichier committé.
- Les limites de login (lot A) sont **en mémoire** : un redémarrage du serveur remet tout
  à zéro — pratique à savoir en debug comme en test.
