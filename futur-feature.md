# Features à venir — What Shall We Play ?

> **Fichier vivant** : les idées se déposent ici en vrac, chaque feature partira d'ici vers un vrai
> brainstorming (maquette → spec → plan) au moment de la lancer.
> Tailles indicatives : 🟢 S · 🟡 M · 🔴 L · 🔴+ XL
> Dernière mise à jour : 2026-10-05

## Ordre suggéré

| # | Feature | Taille | Pourquoi dans cet ordre |
|---|---------|--------|--------------------------|
| 1 | Vote sur l'étagère 👍 — ✓ v3.5.0 | 🟡 M | Indépendant, petit, très « What Shall We Play ? » |
| 2 | Joueurs invités (sans compte) | 🟡 M | LE débloqueur des soirées réelles ; se combine avec le vote |
| 3 | Import de collection BGG — ✓ v3.6.0 | 🟢 S | Supprime le plus gros frottement : saisir ses jeux |
| 4 | Le verdict du jeu 😍🙂😐 — ✓ v3.7.0 | 🟢 S | Une ligne d'état, un gros effet sur les stats et les tirages |
| 5 | Ajout au calendrier | 🟢 S | Minuscule, collé au flow WhatsApp existant |
| 6 | Suggestions intelligentes | 🟡 M | La roue garde le dernier mot, mais informée (données BGG déjà là) |
| 7 | Mon cercle d'amis | 🔴 L | Le socle social : qui voit qui — le prêt s'appuiera dessus |
| 8 | Monétisation premium | 🟡 M | Infra paiement ; ouvre la voie au financement de la ludothèque |
| 9 | Ludothèque virtuelle | 🔴+ XL | Dépend des cercles ; le prêt communautaire pourrait être la feature premium |
| 10 | Notifications push | 🔴 L | Le plus d'infra ; prend tout son sens une fois les cercles en place |
| 11 | FAQ — ✓ v3.8.0 | 🟢 S | Petite, sans dépendance — à glisser au fil de l'eau, quand le contenu existe |
| 12 | Paramétrage de la sélection des jeux | 🟡 M | Petit, colle au flow de création ; rend la sélection plus juste |
| 13 | Le veto ❌ (et le ❤️) | 🟡 M | Sur l'existant (vote v3.5.0), gros effet social pour peu |
| 14 | Parties récurrentes & rendez-vous | 🔴 L | Le rendez-vous du groupe ; ouvre inscriptions et conflits d'horaire |
| 15 | Événements (marathon, KijouKan…) | 🔴 L | La vue « au-dessus des soirées » ; s'appuie sur #14 |
| 16 | Assistant de règles 🤖 | 🔴+ XL | Le plus lourd (IA + coûts) ; candidat premium, à maqueter |
| 17 | Idées repérées ailleurs | — | Menu d'inspiration : items à fondre dans #7/#14/#15 |

---

## 1. Vote sur l'étagère 👍

Avant de lancer le tirage, chaque joueur peut voter 👍 pour les jeux de la sélection — un premier
tri qui révèle les envies (« ce jeu-là, on a vraiment envie d'y jouer ce soir »).

Au moment du lancement, un choix de pool : **tous les jeux** ou **seulement ceux avec un 👍**.

- **Taille** : 🟡 M (UI de vote dans l'étagère + compteurs live + option au lancement)
- **Dépendances** : aucune — indépendant
- **Note** : le vote est révocable, visible en temps réel par tous (sync live), et ne bloque jamais
  le lancement (le pool « tous » reste le défaut). Concevoir l'API de vote **invité-compatible**
  dès le départ (le vote devra s'attribuer à un joueur éphémère — voir #2).

## 2. Joueurs invités (sans compte)

Les vraies soirées ont des visiteurs : un cousin, la copine de Léa. Aujourd'hui il faut un compte
pour chacun. On ajoute des **joueurs éphémères** à la soirée et au tirage — sans installation ni
inscription.

- **Taille** : 🟡 M (lien d'invitation par soirée + page invité + identité éphémère côté serveur)
- **Dépendances** : se combine avec #1 (l'invité vote via son identité éphémère)
- **Note** : le réflexe existe déjà — le partage WhatsApp du verdict. L'organisateur génère un
  **lien d'invitation** (jeton par soirée, révocable) ; l'invité l'ouvre, choisit son prénom, voit
  l'étagère, vote 👍 et suit le tirage en direct (sync live). Le modèle de confiance est celui du
  partage verdict : celui qui a le lien entre dans CETTE soirée, point plus loin. Le joueur
  éphémère vit le temps de la soirée — il reste dans l'historique de la nuit (les stats comptent),
  mais ne crée jamais de compte ni de profil.

## 3. Import de collection BGG

Un champ « pseudo BGG » et la ludothèque se **préremplit** avec ta collection (nom, miniature,
nb de joueurs, durée, poids). Le premier pas est le plus dur — saisir 40 jeux — ça le supprime.

- **Taille** : 🟢 S
- **Dépendances** : aucune (l'API BGG est déjà intégrée)
- **Note** : dédoublonnage avec les jeux déjà présents ; si l'API BGG répond mal, import partiel
  assumé et relançable.

## 4. Le verdict du jeu 😍🙂😐

Après la partie, un micro-sondage dans le verdict : 😍 / 🙂 / 😐. Ça alimente les stats de profil
(« vous avez adoré Cascadia : 4 fois sur 5 ») et peut **peser sur les futurs tirages**.

- **Taille** : 🟢 S (une colonne d'humeur sur la partie + agrégation dans les stats)
- **Dépendances** : aucune
- **Note** : l'effet sur les tirages doit rester doux (léger bonus de poids) — la roue doit garder
  sa surprise. **Garde-fou chiffré (arbitré le 2026-10-04)** : ×1,08 pour le jeu le plus aimé (😍),
  ×1,00 pour un jeu 🙂 ou sans verdict, ×0,98 pour le moins aimé (😐) — soit un écart relatif
  maximal d'environ ×1,10 entre le plus et le moins aimé. Le reste (confiance progressive selon le
  nombre de parties, fenêtre glissante) reste à arbitrer au brainstorming.

## 5. Ajout au calendrier

Bouton « ajouter à mon calendrier » (.ics) sur une soirée programmée — titre, date, heure, joueurs.

- **Taille** : 🟢 S
- **Dépendances** : aucune
- **Note** : s'ouvre dans Calendar / Google Calendar ; le fichier est généré côté serveur (une
  route de plus, pattern identique aux autres).

## 6. Suggestions intelligentes

La roue est drôle mais aveugle. Les données BGG déjà stockées (nb de joueurs, durée, poids)
permettent de **filtrer le tirage par contexte** : « vous êtes 5, il vous reste 45 min, pas de jeu
lourd ».

- **Taille** : 🟡 M (formule de filtre au lancement + bornage du pool de la roue)
- **Dépendances** : aucune (les données BGG sont déjà en base)
- **Note** : on ne remplace pas le hasard, on l'informe — les filtres sont optionnels et la roue
  garde le dernier mot.

## 7. Mon cercle d'amis

Plutôt que de voir tous ceux qui ont créé un compte : chacun crée des **cercles d'amis** avec
invitations, et on peut appartenir à **plusieurs** cercles. Finalement le principe du foyer… mais
pour les amis, et **multi-cercles** (le foyer, lui, reste unique et distinct).

Le champ social se referme : on ne partage l'étagère, les soirées et les stats qu'avec ses cercles.

- **Taille** : 🔴 L (modèle de données cercles + invitations, refonte des permissions de visibilité,
  UI de gestion — c'est le changement le plus profond de l'app depuis le multi-foyer)
- **Dépendances** : aucune — mais c'est le socle de la ludothèque virtuelle (#9)
- **Note** : choisir le périmètre de confidentialité dès le départ (l'étagère de la soirée ? les
  stats de profil ? tout ?) — chaque réponse ajoute ou retire beaucoup de travail.

## 8. Monétisation premium

Proposer des features premium : **3 à 5 €/mois** pour soutenir l'app et débloquer des extras.

- **Taille** : 🟡 M (infra paiement + statut premium du compte + la/les premières features premium)
- **Dépendances** : aucune — à coupler avec #9 : le prêt communautaire (géolocalisation, ludothèque
  à proximité) est un candidat naturel pour *être* la feature premium qui finance la ludothèque
- **Note** : décider tôt ce qui reste gratuit (le cœur ne se dégrade jamais) — la monétisation ne
  doit jamais mettre un mur entre les amis.

## 9. Ludothèque virtuelle (prêt de jeux)

Et si on se prêtait nos jeux ? Deux niveaux :

- **Prêt dans un cercle d'amis** — la confiance de base : les jeux de tes amis, visibles et
  empruntables dans ton cercle.
- **Prêt à la communauté** — une recherche par proximité (**géolocalisation**) des jeux disponibles
  autour de toi, un vrai ludothèque virtuelle.

Le volet sécurité est le cœur du sujet : identité (nom / prénom / adresse), **dépôt de garantie**
(caution), et une communauté bienveillante à construire — l'idée plaît beaucoup, mais elle mérite
de lourdes garanties avant d'ouvrir au public.

- **Taille** : 🔴+ XL (prêt cercle : L avec #7 en place ; prêt communauté : XL à lui seul — profils
  de confiance, garanties, géoloc, suivi d'emprunt, litiges)
- **Dépendances** : **#7 Cercles d'amis** (le prêt cercle en dépend directement) ; **#8 Premium**
  (financement et/ou le prêt communautaire comme feature premium)
- **Note** : démarrer par le prêt dans les cercles (forte confiance, zéro garantie de paiement),
  et laisser le volet communauté mûrir derrière un accès premium/invitations.

## 10. Notifications push

PWA push (VAPID) : « ta soirée commence », « c'est à toi de valider ta sélection », invitation à un
cercle. L'app devient vivante sans être ouverte.

- **Taille** : 🔴 L (infra serveur VAPID + gestion des abonnements + permissions — subtilités iOS)
- **Dépendances** : prend son sens une fois #7 (invitations aux cercles) et les soirées
  programmées en place
- **Note** : commencer par 2-3 notifications essentielles, pas un feed. Sur iOS, exige l'app
  installée — le public PWA installée est déjà celui-là.

## 11. FAQ

Une page « FAQ » pour les questions qui reviennent : c'est quoi l'app, comment on rejoint une
soirée, comment marche le tirage, que deviennent mes données, est-ce payant… Utile aux nouveaux
comme aux curieux qui hésitent avant d'installer la PWA.

- **Taille** : 🟢 S
- **Dépendances** : aucune
- **Sujets déjà identifiés** (2026-10-04) :
  - **La taille des boîtes** — donner une idée concrète de ce qu'est une « grande boîte » (et les
    autres formats) : dimensions physiques, exemples de jeux connus pour chaque format.
  - **Le verdict et ses implications sur la roue** — le verdict pèse-t-il sur le tirage, et
    comment l'expliquer simplement (lien avec le garde-fou de §4 : ×1,08 / ×1,00 / ×0,98).
- **Note** : idée en vrac — collecter les vraies questions posées par les joueurs (2 sujets
  ci-dessus, la collecte est lancée). Page accessible sans compte, une route statique de plus.

## 12. Paramétrage de la sélection des jeux (création de partie)

À la création d'une partie, choisir **qui peut mettre des jeux en lice** :

- **Créateur seul** — le créateur fixe la sélection, les joueurs suivent le tirage.
- **Créateur + joueurs, depuis la collection du créateur** — chacun pioche, mais dans la
  ludothèque du créateur (ce qui est réellement sur la table).
- **Chacun depuis sa propre collection** — le mode actuel.

- **Taille** : 🟡 M (option à la création + périmètre du pool au lancement)
- **Dépendances** : les ludothèques sont déjà en base ; #7 (cercles) réglera qui voit la
  collection de qui
- **Note** : le mode actuel reste le défaut, les autres sont optionnels. Croisement avec #6 :
  la sélection ne fait que borner le pool de la roue — elle garde le dernier mot.

## 13. Le veto ❌ (et le ❤️)

Le vote 👍 devient ❤️ (« j'ai envie d'y jouer »). En face, un **veto ❌** (« pas ce soir »).
Les deux peuvent coexister, avec une règle simple : **un veto annule tous les ❤️ d'un jeu** —
le jeu sort du pool, quel que soit le nombre de votes.

- **Taille** : 🟡 M (nouveau type de vote + règle d'agrégation + UI étagère)
- **Dépendances** : s'appuie sur le vote existant (v3.5.0) et sur l'infra invités (#2 — le veto
  d'un invité doit compter aussi)
- **Note** : à arbitrer au brainstorming — le veto est-il révocable ? un veto bloque pour la
  soirée ou pour toujours ? Le ❤️ remplace le 👍 partout (étagère, pool, partage WhatsApp) :
  migration des données à prévoir.

## 14. Parties récurrentes & rendez-vous

Planifier des parties qui reviennent (le jeudi, tous les quinze jours). Les joueurs **voient les
prochaines dates et rejoignent** celles qu'ils veulent. Deux gardes-fou :

- **Conflit d'horaire** — deux parties le même créneau : alerter, laisser l'humain trancher.
- **Limite de joueurs max (optionnelle)** — au-delà, liste d'attente à arbitrer.

- **Taille** : 🔴 L (récurrence + participations/inscriptions + détection de conflits)
- **Dépendances** : soirées programmées (en place) ; #10 pour les notifications (« ta partie de
  jeudi approche », « une place s'est libérée »)
- **Note** : la limite max doit rester optionnelle — certaines soirées sont ouvertes. Le conflit
  d'horaire alerte sans empêcher : c'est le groupe qui décide.

## 15. Événements (marathon, KijouKan…)

Une section « Événements » au-dessus des soirées :

- **Marathon du jeu** — une date (ou plusieurs), un nombre de joueurs, une sélection de jeux —
  avec les **règles disponibles pour les joueurs** (lien avec #16). Ex. : une journée « on finit
  les campagnes ».
- **Événement custom + sondage de disponibilité** — « qui est dispo ces week-ends-là ? » :
  plusieurs propositions de dates, les participants votent.
- **Sondage KijouKan** (« Qui joue quand ? ») — la disponibilité permanente du groupe, sans
  événement précis.

- **Taille** : 🔴 L (entité événement + sondages de dates + rattachement des soirées)
- **Dépendances** : soirées programmées ; #14 (une récurrence peut être vue comme un événement
  qui englobe des parties) ; #7 pour l'audience
- **Note** : le périmètre exact (marathon vs sondage vs custom) se tranchera au brainstorming
  avec maquette — d'autres apps du genre ont déjà une vue « événements au-dessus des soirées »
  (voir #17 pour le détail).

## 16. Assistant de règles 🤖

Un outil pour sortir du doute sans casser la partie (le genre existe déjà : des assistants de
règles par IA qui répondent depuis une source de règles choisie — référence au ledger) : on
récupère les règles du jeu (PDF/sources officielles), et un petit formulaire permet de poser la
question du moment : **« est-ce qu'on peut placer ce pion ici, que dit la règle ? »** — réponse
courte, sourcée, liée au jeu de la partie en cours.

- **Taille** : 🔴+ XL (catalogue de règles + recherche dans les règles + coûts IA à chaque
  question)
- **Dépendances** : ludothèque (le jeu en cours) ; candidat naturel pour #8 premium — le coût IA
  doit vivre quelque part
- **Note** : la leçon des assistants du genre : « choisis le jeu, choisis la source que ta table
  croit, pose la question » — toujours citer la règle source. Démarrer minuscule : les jeux de la
  ludothèque, 2-3 questions types (mise en place, fin de partie, cas litigieux). Les questions
  « placement de pion » supposent des règles bien structurées : à maqueter avant d'engager.

## 17. Idées repérées ailleurs

Piochées dans les apps du genre (jeux de société, organisation de soirées) — ce qui existe déjà
chez nous n'est pas répété :

- **Sondage multi-dates** — une soirée avec plusieurs propositions de dates, les participants
  choisissent (à fondre dans #14/#15)
- **Groupes** — organiser ses rondes en groupes (chevauche #7 : un seul brainstorming)
- **Chat** — discuter avec les participants (le partage WhatsApp couvre déjà une part du besoin —
  à arbitrer)
- **Partage par lien** — faire circuler ses soirées au-delà du foyer
- **Intégration BGStats** — consigner les résultats aussi dans BG Stats (nos stats restent la
  source, on exporte)
- **Events englobant plusieurs rondes** — voir #15
- (Notifications : déjà prévues #10 · BGG : déjà en place)

- **Taille** : 🟢 S à 🔴 L selon l'item — un menu d'inspiration, pas des engagements
- **Dépendances** : chaque item renvoie à sa section ci-dessus
- **Note** : ces apps sont souvent gratuites et privacy-first — le garde-fou à garder : le cœur
  ne se dégrade jamais (cf. #8).

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
