# What Shall We Play?

L'app des soirées jeux de société : chaque joueur y dépose sa bibliothèque, on coche qui est
présent, on sélectionne les boîtes du soir… et **la roue** choisit à votre place. 🎡

## Fonctionnalités

- **Comptes sans e-mail** : pseudo + code secret (bcrypt, session cookie 30 jours).
- **Bibliothèque** : saisie manuelle ou recherche BoardGameGeek (si `BGG_TOKEN`), pochette
  optionnelle, format de boîte obligatoire (mini/petit/moyen/grand).
- **L'Étagère** : les jeux des joueurs présents, en rayons par format de boîte, sélection au
  toucher (badge ✓ cuivré).
- **Le tirage** : roue plein écran animée (~3,5 s) → verdict en cérémonie, « Sortir la boîte 📦 »
  ou « Relancer », chaque tirage est enregistré dans la soirée.
- **Soirées** : historique (date, joueurs, jeux tirés).
- **PWA installable** (manifest + service worker minimal), pensée mobile-first.

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

L'app écoute sur le port 3000 ; SQLite et les pochettes sont persistés dans le volume
`./data` monté sur `/app/data`. Pour activer la recherche BGG, renseignez le token dans un
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
