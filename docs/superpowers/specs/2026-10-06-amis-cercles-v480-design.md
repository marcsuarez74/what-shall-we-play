# Conception — Amis, cercles et invitations (v4.8.0)

**Date** : 2026-10-06 · **Statut** : validé par le client
**Maquette validée** : `mockup/2026-10-06-v480-cercles.html` (version 3)
**Remplace** : la partie « cercles » (§3 v4.7.0, §4.2) de `2026-10-06-invites-cercles-design.md`.

## 1. Décisions (validées)

- **L'amitié est la base** : un lien réciproque entre deux comptes. Les listes de joueurs ne
  proposent plus que **mes amis et mon foyer** (plus tous les comptes).
- **Devenir amis** : par pseudo (demande à accepter ou refuser) ou par **mon lien d'ami**
  (amis dès l'ouverture : partager son lien vaut accord). Chacun peut retirer un ami (confirmé).
- **Amis d'office à la mise à jour** : les comptes qui ont déjà joué une partie ensemble.
- **Cercles** (le terme est conservé) : des listes d'amis pour inviter en un geste ; une
  personne peut être dans plusieurs cercles ; être dans le même cercle ne rend pas amis.
  - **Adhésion** (réglage, comme les communautés WhatsApp) : **libre** (le lien suffit, tout
    membre ajoute ses amis) ou **sur validation d'un admin** (les arrivées attendent).
  - **Plusieurs admins** : le créateur est admin ; un admin nomme ou retire d'autres admins,
    change le réglage, retire des membres, supprime le cercle. Le dernier admin d'un cercle
    qui a d'autres membres doit en nommer un avant de partir.
  - Supprimer un cercle ne touche ni aux parties ni aux comptes.
- **Invitations** (parties **programmées** seulement ; la partie du jour garde l'inscription
  directe) : programmer envoie une invitation à chaque personne cochée (cercles + amis).
  **Dispo → joueur tout de suite** (étagère, votes) ; **Pas dispo** → retirée des joueurs ;
  réponse modifiable jusqu'au jour J. L'organisateur voit le décompte et peut inscrire
  lui-même un « sans réponse ». Pastille sur l'onglet Parties = invitations sans réponse.
- **Fil d'activité** (lecture seule) : parties terminées des 30 derniers jours où joue au
  moins un de mes amis.
- **Onglet « Amis »** (5ᵉ) : sections Amis · Cercles · Activité.
- Invités par lien (sans compte) : jamais amis, jamais membres d'un cercle.
- Version **v4.8.0** (MINOR).

## 2. Modèle

```sql
ALTER TABLE users ADD COLUMN lien_ami TEXT;            -- index unique, créé à la demande
CREATE TABLE amities (                                  -- une ligne par paire (a < b)
  user_a INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  etat TEXT NOT NULL CHECK (etat IN ('demande','ami')),
  demandeur INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_a, user_b), CHECK (user_a < user_b));
CREATE TABLE cercles (id, nom, lien_token UNIQUE, adhesion 'libre'|'validation', created_by, created_at);
CREATE TABLE cercle_membres (cercle_id, user_id, role 'admin'|'membre', etat 'membre'|'attente',
  ajoute_par, UNIQUE (cercle_id, user_id));
CREATE TABLE night_invites (night_id, user_id, etat 'attente'|'dispo'|'absent', UNIQUE (night_id, user_id));
```

Migration unique (`user_version` 2) : amitiés `ami` entre comptes ayant partagé une partie.

## 3. Règles serveur

- **Relations** (`listRelations`) = amis + membres du foyer, sans les invités. Elles
  remplacent `listComptes` partout (sélecteurs, `/api/users`).
- **Invitable** à une partie programmée = relations + co-membres de mes cercles.
- Les joueurs d'une partie déjà en place restent joueurs (rien n'est retiré implicitement).

## 4. Écrans

| Écran | Route |
|---|---|
| Amis (demandes, liste, ajout par pseudo, mon lien) | `/amis` |
| Cercles (liste, création) | `/amis?s=cercles` |
| Un cercle (membres, admins, adhésion, demandes, lien) | `/amis/cercles/<id>` |
| Activité | `/amis?s=activite` |
| Lien d'ami reçu | `/ami?k=` |
| Lien de cercle reçu | `/cercles/rejoindre?k=` |
| Invitations + Dispo / Pas dispo | `/nights` (section en tête) |

## 5. Tests

- Unitaires : amitié (demande, acceptation croisée, lien, retrait), migration, relations,
  cercles (adhésion libre / validation, admins multiples, dernier admin, quitter, supprimer),
  invitations (programmer → attente, dispo → joueur, absent → retiré, inscription par
  l'organisateur, partie du jour inchangée), activité (30 jours, amis seulement).
- E2E : parcours ami par lien → cercle → partie programmée → invitation → Dispo → joueur ;
  aides E2E existantes : les comptes de test deviennent amis par lien.
