# Vote sur l'étagère 👍 — design (v3.5.0)

**Statut :** spec validée en maquette (`.superpowers/brainstorm/v35-vote/content/maquette-v35-vote-etagere.html`, vérifiée par script Playwright : 29 contrôles, 0 erreur JS), en attente de relecture.
**Objectif :** chacun pose un 👍 sur les boîtes qui lui font envie pendant la préparation ; au lancement, le créateur tire parmi tous les jeux ou seulement les votés. Le vote s'incruste sur l'étagère sans rien changer au rituel (boîtes sur rails, validation, « Sûr ? Lancer »).

## Décisions déjà prises

- **Badge 👍 haut-droite de chaque boîte** (le badge propriétaire reste bas-droite, 16px). Le vote est une incrustation : aucune rangée, aucun onglet, aucun écran de plus.
- **Vote multiple et révocable** : autant de 👍 que voulu, re-toucher le badge retire son vote. Badge cuivré quand C'EST mon vote.
- **Modifiable jusqu'au lancement** : pendant toute la phase « En préparation », vote ou dé-vote librement — même après avoir validé sa sélection (le vote n'est pas une boîte, il ne saute pas la validation).
- **Le choix du pool n'apparaît que si au moins un jeu a un vote** : sinon le lancement est exactement celui d'aujourd'hui.
- **Défaut = « Tous les jeux »** à chaque lancement ; choisir « Votés » est un geste volontaire du créateur au dernier moment.
- **La roue ne sait rien des votes** : on lui passe simplement une liste d'ids plus courte (`?games=`).
- **Invités-compatible dès le départ** : le vote référence un `users.id` ; la feature #2 « Joueurs invités » créera des lignes dans `users`, rien à reprendre.
- **Fixée au bas, comme la prod** : la zone CTA reste `position: fixed` au-dessus de la tab bar (dégradé transparent → noyer, `pointer-events` gérés) — le segmenté s'y incruste sur la même rangée.

## Parcours utilisateur

1. **Voter** : pendant la préparation, toucher le badge 👍 d'une boîte → il devient cuivré, le compteur monte (+1 chez tout le monde en direct). Re-toucher → retiré. Le badge reste visible même à 0 (« 👍 0 ») : il invite à voter.
2. **Suivre** : les compteurs se mettent à jour chez tous les joueurs (sync live, comme l'ajout de boîtes). Info-bulle du badge = prénoms des votants (« Marc, Léa »).
3. **Lancer** (créateur, sélection validée) : la rangée CTA devient `[ Tous les jeux · 4 | Votés 👍 · 3 ] [ Lancer · 3 ]` — le segmenté remplace la pill « ✓ Validée » (l'état de validation est déjà visible dans la carte soirée). Toucher « Votés 👍 » → le bouton passe à `Lancer · 3`. Toucher « Lancer » → tirage sur les 3 jeux votés.
4. **Sans aucun vote** : la rangée CTA est exactement celle d'aujourd'hui : `[ ✓ Validée ] [ Lancer · 4 ]`.
5. **En jeu** : plus de badges ni de votes (étagère gelée, comme tout le reste).

## Le vote sur les boîtes (`components/ShelfClient.tsx`)

- Dans chaque `<button class="box">`, après `BoxImage` et `OwnerBadge` :
  `<span class="vote-badge {vote-moi}" onClick={voter} role="button" aria-pressed aria-label="N votes pour {title}">👍 {n}</span>`.
  **Un `<span>` cliquable, pas un bouton imbriqué** (HTML invalide sinon) ; `e.stopPropagation()` pour ne pas ouvrir la fiche jeu.
- Affiché uniquement quand `night.status === 'creation'` (gelé en jeu, comme tout le bloc boîtes).
- Badge visible pour toute boîte de l'étagère, même à 0 vote. `title` = prénoms des votants.
- La boîte mini (`FORMAT_SCALE < 0.7`, classe `sm`) garde son badge : le surplomb haut-droite (-7px/-5px) reste lisible à 53px.
- **Voter ne touche pas à `validated_at`** (contrairement à l'ajout/retrait d'une boîte).

## Le choix du pool au lancement (cta-zone)

- État client local : `const [pool, setPool] = useState<'tous' | 'votes'>('tous')` — **jamais stocké en base**.
- Branchement dans la branche `jAiValide` du créateur (celle qui montre aujourd'hui la pill + Lancer) :
  - ≥ 1 jeu voté → `<div class="choix-pool" role="radiogroup">` à la place de la pill, puis le bouton Lancer sur la même rangée (`flex` : segmenté 1.25, bouton 1).
  - 0 vote → pill « ✓ Validée » inchangée.
- Libellé : `Lancer · ${cible}` avec `cible = pool === 'votes' && votés.length > 0 ? votés.length : games.length` ; l'armement « Sûr ? Lancer » reste tel quel.
- **Garde au clic** : le pool est recalculé au moment de lancer — si les votes ont disparu entre-temps (sync live), le tirage retombe sur tous les jeux.
- `lancer()` : `window.location.assign('/tirage/${night.id}?games=${ids.join(',')}')` avec `ids = pool === 'votes' && votés.length > 0 ? votés.map(g => g.id) : games.map(g => g.id)`. Navigation document inchangée (fix v3.3.1).
- Hors branchement : non-créateur (« Lancement par … »), non-validé (« Valider ma sélection » + Lancer fantôme), en jeu — **rien ne change**. Le créateur qui n'a pas validé ne voit pas le segmenté : le pool est un réglage du dernier instant.

## API `POST /api/nights/[id]/votes` (`app/api/nights/[id]/votes/route.ts`)

Corps : `{ gameId }`. Même gabarit de garde que la route `games` : session requise (401), id de soirée entier + `getNight` + `userCanAccessNight` (404), corps entier (400) — puis délégation à `toggleNightVote` qui renvoie `{ error, status }` le cas échéant (403/409). Réponse : `{ ok: true }` (le client se fie au `router.refresh()`, idiome établi).

## `lib/nights.ts` — `toggleNightVote(nightId, gameId, userId)`

Fonction pure testable, même contrat que `addNightGame` (`NightGameResult`) :

1. Partie introuvable → 404 ; non-participant → 403 « Seuls les joueurs de la partie peuvent voter ».
2. Partie `en_jeu` → 409 « La partie a commencé — les votes sont figés ».
3. Le jeu doit être sur l'étagère de la soirée (`SELECT 1 FROM night_games WHERE night_id = ? AND game_id = ?`) → 403 « Ce jeu n'est pas sur l'étagère ».
4. Bascule : `DELETE` si le vote `(night_id, game_id, user_id)` existe, sinon `INSERT OR IGNORE`.
5. `notifyNight(nightId)` — le vote se voit en direct chez tout le monde.

Et dans `removeNightGame` : `DELETE FROM game_votes WHERE night_id = ? AND game_id = ?` (une boîte retirée emporte ses votes).

## Page serveur (`app/etagere/page.tsx`)

Charge les votes de la soirée et les passe à `ShelfClient` :

```ts
SELECT gv.game_id, gv.user_id, u.pseudo FROM game_votes gv
JOIN users u ON u.id = gv.user_id WHERE gv.night_id = ?
```

`ShelfClient` reçoit `votes: { gameId: number; userId: number; pseudo: string }[]` et en dérive par boîte : total, mon vote, prénoms (title), liste des ids votés (pool). Zéro nouvel appel client.

## Stockage & migration

- Table **`game_votes`** dans `SCHEMA` (`lib/db.ts`, même motif que `bug_reports` — `getDb()` rejoue `SCHEMA` à chaque démarrage, donc migration automatique des bases existantes) :

```sql
CREATE TABLE IF NOT EXISTS game_votes (
  night_id INTEGER NOT NULL REFERENCES nights(id) ON DELETE CASCADE,
  game_id  INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(night_id, game_id, user_id)
);
```

- Une nouvelle soirée repart à zéro (les votes sont liés à la soirée, pas au jeu). Fin/suppression de soirée → CASCADE. Suppression d'un compte → CASCADE.

## Styles (`app/globals.css`)

- `.vote-badge` : absolu top -7px / right -5px, z-index 3, pastille noyer bordure `--doux`, 10.5px/800, `box-shadow`, `:active scale(.9)` ; variante `.vote-moi` cuivrée (bordure + fond `--cuivre`, texte blanc).
- `.choix-pool` : segmenté noyer 13px, deux cellules, `.actif` = fond `--surface-plus` + pastille `.n` cuivrée ; s'aligne en `flex` avec `.btn-copper` dans `.cta-row`.

## Sync live

Rien de nouveau : `toggleNightVote` appelle `notifyNight` → `emitToUsers` → flux SSE `/api/me/events` → `router.refresh()` chez chaque participant (lecteur fetch + marqueur `body[data-sync="on"]`, idiome v2). Le badge, le segmenté et le compteur du Lancer sont recalculés au re-rendu serveur.

## Tests (TDD)

**Unitaires** (`tests/unit/votes.test.ts`, DATA_DIR de test hors projet) :
- bascule : vote → présent ; re-vote → absent ; deux joueurs sur le même jeu → total 2 ;
- gardes : non-participant 403, jeu hors étagère 403, soirée `en_jeu` 409, partie inexistante 404 ;
- `removeNightGame` supprime les votes du jeu retiré ;
- voter ne modifie pas `validated_at` ;
- `getShelfVotes` renvoie gameId/userId/pseudo.

**E2E** (`tests/e2e/votes.spec.ts`) :
- badge visible à 0, vote → cuivré + compteur 1, re-tap → retiré ;
- le segmenté n'apparaît pas sans vote (pill « ✓ Validée » à la place) ;
- avec un vote : segmenté présent, toucher « Votés 👍 » → le bouton devient `Lancer · M` (M = nombre de jeux votés), navigation vers `/tirage/…?games=` avec les ids des jeux votés ;
- sync live : deux sessions (`data-sync` on), A vote → le badge de B passe à 1 sans rechargement manuel ;
- en jeu : plus de badges.

## Déploiement

Rien de nouveau : pas d'env, pas de service externe, migration automatique au premier démarrage du conteneur. Version `3.5.0` (`package.json` → affichage UserMenu + `sw.js` `wsp-v3.5.0`).

## Décisions d'implémentation à figer au plan

- `votés` = jeux de `games` (l'étagère affichée, hors boîte sortie) filtrés sur la présence d'un vote — recalculé à chaque rendu, pas un état.
- Le `title` du badge liste les prénoms (`pseudo.split(' ')[0]`) joins par « · », plafonné à 4 puis « … ».
- Le segmenté garde une largeur stable : libellés « Tous les jeux · N » / « Votés 👍 · M » avec pastilles `.n` (comme la maquette).
- La réponse de l'API ne renvoie ni total ni état : la vérité vient du refresh serveur (une seule source).

## Hors scope (v3.5.0)

- Voir qui a voté ailleurs que dans l'info-bulle (fiche jeu, profil) ; pondération des votes ; suggestions basées sur les votes (feature #6 du backlog) ; votes persistants entre soirées ; pousser le pool choisi aux autres joueurs (c'est le créateur qui lance, les autres le découvrent au tirage).

## Rulings

- **Vote par soirée** (`game_votes.night_id`) : on vote pour ce soir, pas pour l'éternité — le concept d'étagère reste un rituel du soir.
- **Le vote n'est pas une boîte** : ajouter/retirer une boîte saute la validation (idiome v3.0.0), pas le vote — sinon voter annulerait « ✓ Validée » et le rituel d'armement deviendrait bruyant.
- **Une boîte retirée emporte ses votes** (sinon des votes fantômes compteraient dans « Votés 👍 » d'une boîte disparue).
- **Le pool est un état client** : pas de table, pas de partage — seul le créateur lance, les autres découvrent le périmètre au tirage. Recharger l'étagère remet « Tous ».
- **Badge dans un `<span>`** : jamais de bouton dans un bouton.
- **Le badge à 0 reste visible** : c'est l'invitation à voter ; disparaître ferait croire à une panne.
- **L'API est invité-compatible d'emblée** : le vote est rattaché à `users.id`, forme que prendront aussi les invités (feature #2) — aucun rattrapage prévu.
