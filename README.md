# What Shall We Play?

L'app des parties de jeux de société : chacun apporte sa ludothèque, on pose les boîtes du soir
sur l'étagère, on vote… et **la roue** choisit à votre place. 🎡

## Fonctionnalités

- **Comptes sans e-mail** : pseudo + code secret à 4 chiffres (bcrypt, limite de tentatives),
  « Se souvenir de moi » (session d'un an + jeton d'appareil pour les PWA).
- **Ludothèque** : saisie manuelle ou recherche BoardGameGeek (autocomplete, import de
  collection), pochette réduite à l'enregistrement, format de boîte (mini/petit/moyen/grand).
  **Foyers** : une ludothèque commune à plusieurs comptes, avec fusion des doublons.
- **Parties** : du jour ou programmées (titre facultatif, date, heure). L'**étagère** d'une
  partie range les boîtes des joueurs par format ; chacun ajoute ses jeux et vote 👍, même à
  l'avance pour une partie programmée.
- **Invités par lien** : sans compte, un invité ne voit que sa soirée (jeux, vote, fiche des
  jeux) ; il peut se retirer ou créer son compte en gardant ses votes.
- **Le tirage** (le jour J) : roue plein écran parmi toutes les boîtes ou les votées, puis
  « Sortir la boîte 📦 ». Scores, podium, verdict du jeu 😍🙂😐, historique et corrections.
- **Partage WhatsApp** : invitation (avec lien), résultat du tirage, podium.
- **Français / anglais**, **PWA installable**, signalement de bug intégré (issue GitHub).

## Stack

[Next.js 15](https://nextjs.org) (App Router, TypeScript, sortie *standalone*) · SQLite via
[better-sqlite3](https://github.com/WiseLibs/better-sqlite3) · UI maison sans framework CSS ·
[Playwright](https://playwright.dev) (E2E) + [Vitest](https://vitest.dev) (unitaires).

## Démarrage

```bash
npm install
npm run dev        # http://localhost:3000
```

Les données (SQLite + pochettes) vivent dans `./data` (surchargeable avec `DATA_DIR`).

### Variables d'environnement

Toutes facultatives (fichier `.env` à côté du `docker-compose.yml` en production).

| Variable | Rôle |
|---|---|
| `DATA_DIR` | dossier des données (défaut `./data`, `/app/data` dans l'image) |
| `PUBLIC_URL` | URL publique, pour les liens partagés et les aperçus (défaut : le domaine de prod) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Clés des notifications push (facultatives : générées une fois dans `data/vapid.json` sinon) |
| `VAPID_SUBJECT` | Contact déclaré aux services de push (défaut : `mailto:contact@marco-studio.fr`) |
| `BGG_TOKEN` | jeton de l'API BoardGameGeek (recherche, fiches, import de collection) |
| `BGG_COOKIE` | à défaut de jeton, cookie de session BGG (voir plus bas) |
| `GITHUB_BUG_TOKEN`, `GITHUB_REPO` | signalement de bug : jeton et dépôt où créer l'issue |
| `TZ` | fuseau du « jour » d'une partie (`Europe/Paris` dans l'image) |

### Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run build` / `npm start` | build de production / serveur |
| `npm test` | tests unitaires (Vitest) |
| `npm run test:e2e` | parcours E2E (Playwright, démarre le serveur tout seul) |
| `npm run lint` | ESLint |

## Déploiement VPS (Docker)

```bash
docker compose up -d --build
```

L'app écoute sur `127.0.0.1:3000` ; SQLite et les pochettes sont persistés dans le volume
`./data` monté sur `/app/data`. Le conteneur tourne en utilisateur `node` (uid 1000) : le
déploiement de la CI lui rend le dossier (`chown`) ; en manuel, faites-le une fois
(`sudo chown -R 1000:1000 data`). Sonde de santé : `GET /api/sante`. Pour activer la recherche BGG, renseignez le token dans un
fichier `.env` à côté du compose (il est transmis au conteneur) :

```bash
echo 'BGG_TOKEN=votre-token' > .env
```

En attendant le token, l'API BGG (verrouillée) accepte aussi un cookie de session :
`echo 'BGG_COOKIE="bggusername=…; bggpassword=…"' >> .env` (copier l'en-tête `Cookie`
d'une requête connectée dans les devtools). `BGG_TOKEN`, dès obtention, reprend la main.

Le « jour » d'une soirée suit l'heure locale **Europe/Paris** (`TZ` est fixé dans l'image et le
compose) : une soirée reste « la soirée du jour » jusqu'au changement de jour parisien, pas UTC.

### Reverse proxy HTTPS (Caddy, le plus court)

```caddyfile
jeu.votre-domaine.tld {
    reverse_proxy 127.0.0.1:3000
}
```

L'app n'écoute que sur `127.0.0.1` (voir `docker-compose.yml`) : visez cette adresse plutôt que
`localhost`, qui peut se résoudre en IPv6 (`::1`). Caddy transmet l'IP du client dans
`X-Forwarded-For` sans configuration (limite de tentatives de connexion par IP).

Équivalent nginx (`/etc/nginx/sites-available/jeu`) :

```nginx
server {
    listen 443 ssl;
    server_name jeu.votre-domaine.tld;
    ssl_certificate     /etc/letsencrypt/live/jeu.votre-domaine.tld/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/jeu.votre-domaine.tld/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        # IP réelle du client : sert à la limite de tentatives de connexion par IP
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

(Pensez aussi à `client_max_body_size 6M;` pour les pochettes ≤ 5 Mo.)

### Sauvegarde

Tout l'état de l'app tient dans `./data` : `app.db` (SQLite, mode WAL) et `covers/`. Une
sauvegarde = une copie du dossier :

```bash
tar czf wsp-data-$(date +%F).tgz data/
```

Le mieux est de le faire hors pic (le WAL est vidé régulièrement) et de tester une
restauration une fois : décompressez dans `./data` puis redémarrez `docker compose restart`.
