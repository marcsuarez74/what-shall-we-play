# Conception — Invités par lien & Cercles d'amis

**Date** : 2026-10-06 · **Statut** : proposé (sections 1 et 2 validées en conversation)
**Lots** : v4.6.0 (invités) puis v4.7.0 (cercles + RSVP + fil minimal)

## 1. Intention

Permettre d'inviter à une soirée des personnes **sans compte** (lien d'invitation interactif)
et de **ne jamais re-inviter manuellement les mêmes** (cercles récurrents). Un invité doit
pouvoir dire « je ne suis pas dispo ce soir » **dans l'app** (RSVP), pas seulement par WhatsApp.

Succès = : une soirée mixte (comptes + invités) se joue de bout en bout (étagère, scores,
verdict) ; un membre de cercle reçoit l'invitation dans l'app et répond en deux taps.

## 2. Décisions de cadrage (validées par le client)

| Question | Décision |
|---|---|
| Invités sans compte | **Lien d'invitation**, interactif depuis leur navigateur |
| Cercle, à quoi ça sert | Les **trois** : groupe récurrent invité en un geste + fil d'activité + carnet d'adresses |
| Rejoindre un cercle | **Par pseudo et par lien** |
| Diffusion de l'invitation | **Visible dans l'app + lien WhatsApp**, avec **RSVP obligatoire** (dispo / pas dispo) |
| Invités dans les cercles | **Non** — cercles = comptes seulement ; les invités restent une mécanique de soirée |
| Modélisation invité | **Approche A** : invité = ligne `users` marquée, tout l'existant réutilisé |

## 3. Modèle de données

### v4.6.0 — invités

```sql
ALTER TABLE users ADD COLUMN est_invite INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN host_id INTEGER REFERENCES users(id);
ALTER TABLE nights ADD COLUMN lien_token TEXT UNIQUE; -- généré à la création
```

- Pseudo invité : **le nom choisi par l'hôte** (« Léa »), rendu unique par suffixe
  numérique en cas de collision (« Léa 2 »). La contrainte de charset
  `^[A-Za-z0-9@!_]{3,20}$` ne s'applique **qu'à l'inscription** — les pseudos invités
  en sont exemptés (l'invité ne se connecte jamais : la connexion rejette
  `est_invite = 1`). Une seule colonne, un seul affichage, pas de mapping.
- `host_id` = l'hôte propriétaire (purge explicite, affichage « invité de Marc »).
- Aucune autre table touchée : `night_players`, `night_scores`, `game_votes`,
  `night_verdicts`, `night_games.added_by` référencent déjà `users(id)` — l'invité
  les utilise tels quels.

### v4.7.0 — cercles

```sql
ALTER TABLE nights ADD COLUMN nom TEXT; -- nom facultatif de la partie
CREATE TABLE IF NOT EXISTS cercles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  createur_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lien_token TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS cercle_membres (
  cercle_id INTEGER NOT NULL REFERENCES cercles(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(cercle_id, user_id)
);
CREATE TABLE IF NOT EXISTS night_invites (
  night_id INTEGER NOT NULL REFERENCES nights(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  etat TEXT NOT NULL DEFAULT 'attente' CHECK (etat IN ('attente','dispo','absent')),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(night_id, user_id)
);
```

RSVP révocable (re-répondre remplace), même idiome que les votes.

## 4. Parcours

### 4.1 Invité (v4.6.0)

1. L'hôte partage le lien `/nights/<id>/rejoindre?k=<token>` (message pré-rempli,
   même modèle que l'annonce WhatsApp du verdict).
2. Le lien s'ouvre sur la soirée : **saisie du nom** → création de l'invité + ajout aux
   joueurs. Si le navigateur porte déjà une session compte : proposition de rejoindre
   **avec son compte** (ajout à `night_players`) plutôt qu'en invité.
3. Identité invité mémorisée en **localStorage** (`wsp_night_<id>`) + session standard
   1 an — la leçon v4.5.0 (cookies PWA Android perdus quand l'app est tuée) s'applique.
4. L'invité fait tout ce qu'un joueur fait : votes d'étagère, scores, verdict, corrections.
5. **Retrait par l'hôte** : le geste existant « retirer de la soirée », étendu aux invités —
   supprime la ligne `users` (CASCADE sur votes/scores/verdicts). Suppression explicite
   et confirmée (garde-fou « une donnée n'est jamais détruite implicitement »).

### 4.2 Cercles + RSVP (v4.7.0)

1. **Création** (page « Cercles ») : nom + lien de partage. Ouvrir le lien avec un compte
   rejoint ; sans compte → invitation à en créer un (cercles = comptes).
2. **Ajout par pseudo** sur la page du cercle (les deux portes : lien + pseudo).
3. **Création de soirée** : **nom facultatif** (placeholder « Soirée jeux 🎲 » — à vide,
   l'affichage retombe sur « Partie du vendredi 9 octobre ») + cases à cocher des cercles +
   invités individuels → une `night_invites` par membre (l'hôte est joueur d'office).
   L'invitation doit dire à quoi on est invité : nom (ou date) + hôte + lieu.
4. **RSVP** : la soirée apparaît chez les membres dans « Mes soirées » (pastille
   d'invitation) → boutons **Dispo / Pas dispo**, révocables. L'hôte voit le décompte
   (X dispo, Y absents, Z sans réponse).
5. **Lancement** : seuls les « dispo » (+ l'hôte) deviennent `night_players` ; l'hôte peut
   ajouter manuellement un sans-réponse de dernière minute. Le lien WhatsApp reste un
   raccourci d'ouverture, pas une seconde mécanique.
6. **Fil d'activité (v1 minimal)** : page « Amis » en lecture seule — soirées récentes des
   membres de mes cercles (jeu tiré + verdicts), triées par date.

## 5. Sécurité et limites

- Tokens (soirée, cercle) : aléatoires 32+ hex, préfixés par contexte, unicité en base.
- La connexion rejette les comptes invités ; les listes de recherche de pseudo
  (foyers, cercles) excluent `est_invite = 1`.
- Un invité ne voit que sa soirée (session standard, portée par les routes existantes).
- Suppression d'un invité = geste explicite de l'hôte, confirmé, CASCADE annoncé.
- Pas d'e-mail, pas de push : la découverte passe par l'app (Mes soirées) et le partage
  de lien (WhatsApp) — périmètre assumé.

## 6. UI (règles du dépôt + décisions validées sur maquette)

Palette noyer/crème/cuivre, Bricolage Grotesque + Space Grotesk, FR par défaut (chaîne
typée dans `lib/i18n/` avec miroir EN). **Maquette validée le 2026-10-06**
(`.superpowers/brainstorm/v46-invites-cercles/content/maquette-v46-invites-cercles.html`) :

- **5ᵉ onglet « Amis » (👥)** dans la TabBar — héberge Cercles et Activité (segmenté).
- **Pastille cuivre de comptage** sur l'onglet 🎲 Parties : nombre d'invitations en
  attente de RSVP, disparaît quand tout est répondu ; aria-label « Parties, N invitations
  en attente ».
- **Nom facultatif de partie** à la création (repli « Partie du <date> ») — l'invitation
  dit nom (ou date) + hôte.
- Écrans clés : invitations + RSVP en haut de « Mes soirées », vue de soirée côté invité
  (badge « invitée de … »), formulaire de soirée avec cases à cocher des cercles,
  détail cercle (membres, ajout par pseudo, lien), fil d'activité lecture seule.

## 7. Tests

- **Unitaires** : création/unicité des pseudos invités, rejet de connexion invité,
  token de soirée (génération/validation), RSVP (états + révocation), invitations au
  lancement (seuls les dispo deviennent joueurs), retrait d'invité (CASCADE compté).
- **E2E** : parcours invité complet (lien → nom → vote → score → verdict, retour sans
  re-saisie) ; cercle (création → ajout par pseudo → lien) ; soirée avec cercle
  (invitation → RSVP dispo/absent → lancement → pod1) ; garde : la connexion invité échoue.
- Accroches stables (`aria-label`) posées avec l'UI, mises à jour dans le même commit.

## 8. Séquence de livraison

1. **v4.6.0** : invités (lien, identité, retrait) — release indépendante.
2. **v4.7.0** : cercles + RSVP + fil minimal (s'appuie sur les liens de soirée posés en 4.6.0).

Chaque lot : maquette validée → code (TDD) → suite verte → PR → CI → release → prod.
