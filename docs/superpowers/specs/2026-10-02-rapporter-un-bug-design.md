# Rapporter un bug depuis l'app — design (v3.4.0)

**Statut :** spec validée en maquette (`.superpowers/brainstorm/52992-1790804838/content/maquette-v34-rapporter-un-bug.html`), en attente de relecture.
**Objectif :** les joueurs remontent bugs et améliorations depuis l'app ; chaque signalement devient une issue GitHub complète (contexte technique attaché automatiquement) sur `marcsuarez74/what-shall-we-play`.

## Décisions déjà prises

- **Pas de capture automatique** (choix utilisateur) : l'utilisateur peut joindre une capture de sa galerie s'il le veut. Pas de dépendance de rendu canvas (html2canvas écarté).
- **Issues publiques** (dépôt public) : pseudos et contenu des descriptions y seront visibles — assumé. Les captures jointes restent sur le VPS (URL à jeton), jamais committées dans git.
- **Approche « relais serveur »** : le navigateur n'appelle jamais GitHub ; un jeton fin côté serveur ouvre l'issue. Écarté : pré-remplissage github.com (exigerait un compte GitHub à chaque joueur) et stockage sans GitHub (perte de l'outil de suivi).
- **Menu** : « 🐞 Rapporter un bug » sous « Se déconnecter », au-dessus de la version.
- **Quota : 3 signalements / joueur / jour** (anti-spam familial, pas une forteresse).

## Parcours utilisateur

1. Menu utilisateur (n'importe quelle page) → « 🐞 Rapporter un bug » → `/bugs`.
2. Formulaire : titre, type (🐛 Bug / ✨ Amélioration), description, capture optionnelle, bloc « Informations envoyées » dépliable (transparence totale sur ce qui part).
3. « Envoyer » → appel `POST /api/bugs` → écran succès : « Merci, c'est signalé ! Issue #N ouverte » + lien GitHub + retour.
4. Erreurs en français inline (quota, indisponible, validation).

## Écran `/bugs` (client `BugReportClient` + page serveur)

- Page serveur : session requise (redirect `/login`), passe `me` (pseudo) au client.
- Champs : **titre** (input texte, 3-120 caractères), **type** (deux cartes radio : 🐛 Bug / ✨ Amélioration, bug par défaut), **description** (textarea, 10-4000 caractères), **capture** (input file `accept="image/*"`, optionnel, jpg/jpeg/png/webp, ≤ 5 Mo, aperçu avec bouton « retirer »).
- Compteur de caractères discret sur la description ; bouton désactivé tant que titre/description ne respectent pas les minimums.
- Bloc `<details>` « 🔍 Informations envoyées avec le rapport » **ouvert par défaut** : liste clé→valeur lisible (voir « Infos appareil »). Rien de caché.
- Bouton principal : « Envoyer le signalement » (libellé devient « Proposer l'amélioration » si type ✨). Pendant l'envoi : désactivé + « Envoi… ».
- Écran succès dans la même page (état, pas une route) : ✓ vert, « issue #N ouverte », lien `https://github.com/<repo>/issues/<n>`, bouton « Revenir à l'étagère » (`router.push('/etagere')`).
- TabBar visible (page ordinaire, pas un écran plein).
- Champs : `font-size: 16px` minimum (ruling zoom iOS).

## Menu (`components/UserMenu.tsx`)

- Ajout : `<Link href="/bugs">🐞 Rapporter un bug</Link>` **après** « Se déconnecter », avant la version.
- Au passage : « Mon profil » passe de `<a href>` à `<Link>` (cohérence + règle ESLint `no-html-link-for-pages` qui a fait échouer le build v3.3.1).

## API `POST /api/bugs` (multipart/form-data, session requise)

Route : `app/api/bugs/route.ts`. Champs : `title`, `type` (`bug`|`amelioration`), `description`, `page` (pathname d'origine), `device` (JSON stringifié, voir plus bas), `capture` (File, optionnel).

Logique serveur (lib `lib/bugs.ts`, fonction pure testable `createBugReport`) :

1. **Validation** : titre 3-120, description 10-4000, type ∈ {bug, amelioration}, capture optionnelle (ext ∈ jpg/jpeg/png/webp, ≤ 5 Mo) → 400 avec message français sinon.
2. **Quota** : `SELECT COUNT(*) FROM bug_reports WHERE user_id = ? AND date(created_at) = date('now','localtime')` ≥ 3 → 429 « Tu as déjà envoyé 3 signalements aujourd'hui — à demain ! ».
3. **Capture** : si présente → `saveBugCapture(buf, ext)` (même mécanique que `saveCover` de `lib/storage.ts`, dossier `DATA_DIR/bugs/`, nom `uuid.ext`) → URL publique `https://<host>/api/bugs/capture/<uuid.ext>`.
4. **Corps markdown** (modèle exact plus bas) → **appel GitHub** `POST /repos/{repo}/issues` (`GITHUB_API` ?? `https://api.github.com`, header `Authorization: Bearer $GITHUB_BUG_TOKEN`, timeout 10 s). Titre `[Bug] …` / `[Amélioration] …`, labels `["bug"]` / `["amélioration"]` (créés automatiquement par GitHub, l'app a le droit push sur les issues).
5. **Insertion** `bug_reports` (user_id, type, titre, issue_url, capture_name, created_at localtime).
6. **Réponse** : `{ ok: true, issueUrl, issueNumber }`.

Erreurs mappées : token absent → **503** « Signalement indisponible pour le moment — réessaie plus tard » ; GitHub 4xx/5xx ou timeout → **502** « GitHub n'a pas répondu — ton signalement n'est pas perdu, réessaie » ; quota → **429** ; validation → **400**.

### Infos appareil (collectées côté client, affichées dans le formulaire)

| Champ | Source | Exemple |
|---|---|---|
| Version de l'app | `pkg.version` (import comme UserMenu) | `v3.4.0` |
| Page d'origine | `usePathname()` | `/tirage/12` |
| Appareil | `navigator.userAgentData.getHighEntropyValues(['model','platform','platformVersion'])` si dispo (Android = modèle exact), sinon parse du User-Agent | `SM-S918B · Android 15` / `iPhone · iOS 18.0` |
| Navigateur | brands de `userAgentData`, sinon parse UA | `Chrome 130` / `Safari 18` |
| Écran | `screen.width × height` × `devicePixelRatio` | `390 × 844 @3x` |
| Langue | `navigator.language` | `fr` |
| Installée | `matchMedia('(display-mode: standalone)')` ∥ `navigator.standalone` | `installée` / `navigateur` |
| Signalé par | `me.pseudo` + date/heure locale fr-FR | `Marc · 02/10 à 14:32` |

Le client envoie ce bloc en JSON (champ `device`) ; le serveur **ajoute l'`User-Agent` brut du header de la requête** (source de vérité, non falsifiable par le formulaire) en fin de bloc. Pas d'IP (inutile ici, données personnelles).

### Modèle du corps d'issue

```markdown
## Description
<description telle quelle>

## Contexte
- Page : `/tirage/12` · app `v3.4.0`
- Appareil : iPhone · Safari 18 (iOS 18.0) · écran 390×844 @3x
- Langue : fr · installée
- Signalé par **Marc** le 02/10/2026 à 14:32

![capture](https://etagere.marc-suarez.fr/api/bugs/capture/<uuid>.png)

<details><summary>User-Agent brut</summary>

Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 …)
</details>
```

(Ligne capture uniquement si jointe. `host` déduit de l'URL de la requête ou `PUBLIC_URL` env — voir « Décision d'implémentation ».)

## Stockage & migration

- Table **`bug_reports`** : `id INTEGER PK`, `user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE`, `type TEXT NOT NULL`, `titre TEXT NOT NULL`, `issue_url TEXT`, `capture_name TEXT`, `created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))`.
- Migration dans `runMigrations` (`lib/db.ts`) : `CREATE TABLE IF NOT EXISTS` (pattern existant).
- Captures : `DATA_DIR/bugs/` via `saveBugCapture`/`isSafeCaptureName`/`bugCapturePath` dans `lib/storage.ts` (même style que covers).

## Servir une capture : `GET /api/bugs/capture/[name]`

- **Sans auth** (GitHub doit pouvoir charger l'image), mais `name` validé par regex stricte (`^[a-f0-9-]+\.(jpg|jpeg|png|webp)$` → uuid v4 non devinable) et `path.basename` anti-traversée.
- Headers : `Content-Type` selon ext, `Cache-Control: public, max-age=31536000, immutable` (les uuid ne changent jamais), 404 si absent.

## Sécurité

- **`GITHUB_BUG_TOKEN` jamais côté client** : lu uniquement dans la route serveur ; absent des réponses, des logs, du bundle.
- Jeton recommandé : **fine-grained PAT**, dépôt `what-shall-we-play` uniquement, permission « Issues: Read and write ». Aucun autre droit.
- Session obligatoire sur `POST /api/bugs` ; quota par compte (pas par IP).
- Nom de capture aléatoire (uuid) : l'URL n'est devinable que si elle fuite depuis l'issue.
- Échappement : la description est insérée telle quelle dans le markdown (GitHub la rend safe) ; les champs de contrôle (type, ext) sont whitelistés côté serveur.

## Tests (TDD)

**Unitaires** (`tests/unit/bugs.test.ts`, fetch GitHub mocké via `vi.stubGlobal`) :
- validation (titres trop courts/longs, description, type invalide, capture trop lourde/mauvaise ext) ;
- quota : 3 OK puis 429 ;
- corps markdown : contient titre préfixé, description, page, version, pseudo, et la ligne capture si fournie (absente sinon) ;
- mapping erreurs : token absent → 503, GitHub 500/timeout → 502, succès → issueUrl + ligne en base ;
- capture stockée dans `DATA_DIR/bugs` (DATA_DIR de test, hors projet — ruling E2E).

**E2E** (`tests/e2e/bugs.spec.ts`) :
- menu → lien visible sur toutes les pages (/etagere), mène à /bugs ;
- sans jeton en CI : remplir et envoyer → message 503 affiché proprement (le parcours d'erreur est le parcours réel en CI) ;
- validation client : bouton désactivé si titre trop court ;
- infos techniques visibles dans le bloc (version + page) ;
- quota non testé en E2E (unitaire suffit).

## Déploiement (actions utilisateur, une fois)

1. GitHub → Settings → Developer settings → Fine-grained tokens → générer un jeton : repository access = `what-shall-we-play` seul, permissions = Issues: Read and write.
2. Sur le VPS, ajouter `GITHUB_BUG_TOKEN=github_pat_…` au `.env` à côté du `docker-compose.yml`.
3. `docker-compose.yml` : ajouter `- GITHUB_BUG_TOKEN=${GITHUB_BUG_TOKEN:-}` dans `environment` (même motif que `BGG_TOKEN`).
4. Optionnel : `GITHUB_REPO` (défaut `marcsuarez74/what-shall-we-play`) et `PUBLIC_URL` (défaut `https://etagere.marc-suarez.fr`) en env pour la base des URLs de capture.

## Décisions d'implémentation à figer au plan

- `host` des URLs de capture : `process.env.PUBLIC_URL ?? 'https://etagere.marc-suarez.fr'` (simple, explicite ; la déduction par header est fragile derrière le proxy).
- Le type est stocké en clair (`bug`/`amelioration`) ; le label GitHub est mappé dans `lib/bugs.ts` (`bug` → `bug`, `amelioration` → `amélioration`).
- `userAgentData` n'existe pas dans les types DOM : petite déclaration locale dans le client (`interface NavigatorUAData`), pas de dépendance.
- L'écran succès est un état du client (pas de route) : le refresh ne reposte pas.

## Hors scope (v3.4.0)

- Capture automatique de la page (choix utilisateur) ; consultation des rapports dans l'app ; notifications à la création ; fermeture automatique des issues corrigées ; pièces jointes multiples.

## Rulings

- Écran succès = état client, pas une route → impossible de reposter en rechargeant.
- Pas d'IP dans l'issue (donnée personnelle, aucun besoin de correction de bug).
- Le quota compte les lignes `bug_reports` du jour — y compris les échecs GitHub ? **Non** : on n'insère la ligne QUE si l'issue est créée (les échecs ne consomment pas le quota).
- En cas d'échec GitHub, la capture déjà stockée reste sur le disque (nettoyage différé non implémenté — volume négligeable).
