# CLAUDE.md — What Shall We Play?

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

## Coût réel des vérifications (mesuré)

| Commande | Durée | Quand |
|---|---|---|
| `npx vitest run tests/unit/<fichier>.test.ts` | 2-5 s | boucle TDD |
| `npx vitest run` (250 tests) | ~45 s | avant chaque commit |
| `npx tsc --noEmit` | ~10 s | avant chaque commit |
| `npx playwright test tests/e2e/<spec>.spec.ts` | 1-2 min | pendant le dev, specs ciblées |
| `npx playwright test` (97 tests) | ~6 min local, ~14 min CI | **une fois** avant la PR |

Ne lance jamais la suite E2E complète en boucle : c'est la ressource la plus chère du projet,
et c'est la **CI GitHub qui arbitre** (environnement propre).

## E2E : le protocole anti-flake (payé une fois, ne pas repayer)

- `workers: 1` — toute la suite partage **un** serveur dev et **une** base SQLite. La base
  (`os.tmpdir()/wsp-e2e-data`) n'est purgée qu'au démarrage **à froid** du serveur de test.
- `reuseExistingServer: true` : un serveur **orphelin** sur :3000 est adopté **avec sa base
  périmée** (échecs incompréhensibles garantis). Avant un run :
  `lsof -nP -iTCP:3000 -sTCP:LISTEN` et tue l'orphelin.
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
