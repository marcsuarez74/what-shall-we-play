# Features à venir — What Shall We Play ?

> **Fichier vivant** : les idées se déposent ici en vrac, chaque feature partira d'ici vers un vrai
> brainstorming (maquette → spec → plan) au moment de la lancer.
> Tailles indicatives : 🟢 S · 🟡 M · 🔴 L · 🔴+ XL
> Dernière mise à jour : 2026-10-02

## Ordre suggéré

| # | Feature | Taille | Pourquoi dans cet ordre |
|---|---------|--------|--------------------------|
| 1 | Vote sur l'étagère 👍 | 🟡 M | Indépendant, petit, très « What Shall We Play ? » |
| 2 | Mon cercle d'amis | 🔴 L | Le socle social : qui voit qui — le prêt s'appuiera dessus |
| 3 | Monétisation premium | 🟡 M | Infra paiement ; ouvre la voie au financement de la ludothèque |
| 4 | Ludothèque virtuelle | 🔴+ XL | Dépend des cercles ; le prêt communautaire pourrait être la feature premium |

---

## 1. Vote sur l'étagère 👍

Avant de lancer le tirage, chaque joueur peut voter 👍 pour les jeux de la sélection — un premier
tri qui révèle les envies (« ce jeu-là, on a vraiment envie d'y jouer ce soir »).

Au moment du lancement, un choix de pool : **tous les jeux** ou **seulement ceux avec un 👍**.

- **Taille** : 🟡 M (UI de vote dans l'étagère + compteurs live + option au lancement)
- **Dépendances** : aucune — indépendant
- **Note** : le vote est révocable, visible en temps réel par tous (sync live), et ne bloque jamais
  le lancement (le pool « tous » reste le défaut).

## 2. Mon cercle d'amis

Plutôt que de voir tous ceux qui ont créé un compte : chacun crée des **cercles d'amis** avec
invitations, et on peut appartenir à **plusieurs** cercles. Finalement le principe du foyer… mais
pour les amis, et **multi-cercles** (le foyer, lui, reste unique et distinct).

Le champ social se referme : on ne partage l'étagère, les soirées et les stats qu'avec ses cercles.

- **Taille** : 🔴 L (modèle de données cercles + invitations, refonte des permissions de visibilité,
  UI de gestion — c'est le changement le plus profond de l'app depuis le multi-foyer)
- **Dépendances** : aucune — mais c'est le socle de la ludothèque virtuelle (#4)
- **Note** : choisir le périmètre de confidentialité dès le départ (l'étagère de la soirée ? les
  stats de profil ? tout ?) — chaque réponse ajoute ou retire beaucoup de travail.

## 3. Monétisation premium

Proposer des features premium : **3 à 5 €/mois** pour soutenir l'app et débloquer des extras.

- **Taille** : 🟡 M (infra paiement + statut premium du compte + la/les premières features premium)
- **Dépendances** : aucune — à coupler avec #4 : le prêt communautaire (géolocalisation, ludothèque
  à proximité) est un candidat naturel pour *être* la feature premium qui finance la ludothèque
- **Note** : décider tôt ce qui reste gratuit (le cœur ne se dégrade jamais) — la monétisation ne
  doit jamais mettre un mur entre les amis.

## 4. Ludothèque virtuelle (prêt de jeux)

Et si on se prêtait nos jeux ? Deux niveaux :

- **Prêt dans un cercle d'amis** — la confiance de base : les jeux de tes amis, visibles et
  empruntables dans ton cercle.
- **Prêt à la communauté** — une recherche par proximité (**géolocalisation**) des jeux disponibles
  autour de toi, un vrai ludothèque virtuelle.

Le volet sécurité est le cœur du sujet : identité (nom / prénom / adresse), **dépôt de garantie**
(caution), et une communauté bienveillante à construire — l'idée plaît beaucoup, mais elle mérite
de lourdes garanties avant d'ouvrir au public.

- **Taille** : 🔴+ XL (prêt cercle : L avec #2 en place ; prêt communauté : XL à lui seul — profils
  de confiance, garanties, géoloc, suivi d'emprunt, litiges)
- **Dépendances** : **#2 Cercles d'amis** (le prêt cercle en dépend directement) ; **#3 Premium**
  (financement et/ou le prêt communautaire comme feature premium)
- **Note** : démarrer par le prêt dans les cercles (forte confiance, zéro garantie de paiement),
  et laisser le volet communauté mûrir derrière un accès premium/invitations.

---

## Dette technique

Les petits chantiers reportés, à prendre au fil des releases (rien d'urgent) :

- **Factoriser le bloc de stockage uuid** (`saveBugCapture` vs `saveCover` dans `lib/storage.ts`) —
  délibéré en v3.4.0 pour ne pas toucher au code covers validé en prod ; à faire dans une release
  dédiée au refactoring.
- **Nettoyer les captures orphelines** — une capture jointe peut rester sur disque si le
  signalement échoue après sauvegarde (quota/GitHub). GC ou purge à l'envoi, à arbitrer.
- **Petits tests/hardening** : assertion de confinement `bugCapturePath` (préfixe `BUGS_DIR`),
  plafond de longueur sur le champ `page`, message 429 à templéter avec `QUOTA_JOUR`,
  `?depuis=` asserté en E2E, titre d'it E2E à jour.
