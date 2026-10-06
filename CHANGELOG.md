# Changelog

Toutes les évolutions notables de l'app sont documentées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) —
versionnement [sémantique](https://semver.org/lang/fr/) (`MAJOR.MINOR.PATCH`).

## [4.5.0] — 2026-10-06

### Ajouté
- **« Se souvenir de moi »** (cochée par défaut) — session d'un an au lieu de 30 jours, et un
  **jeton d'appareil** en secours : les PWA peuvent perdre leur cookie quand l'app est tuée
  (constaté Android) ; au retour sur la connexion, la session se restaure silencieusement.
  La déconnexion purge explicitement le jeton. Décochée : comportement 30 jours inchangé.
- **« Récupérer les pochettes »** dans la ludothèque — un bouton (visible seulement s'il
  existe des jeux BGG sans image) qui complète les fiches existantes : fiche `/thing` +
  téléchargement, garde 1 req/s, compteur final. Liste et bottom-sheet affichaient déjà les
  pochettes ; c'était une question de données.

### Modifié
- **Autocomplete épuré** — la liste live devient `nom (année)` sans pochette (et sans le
  préchargement `/thing` associé, des requêtes pour rien) ; l'année reste.
- **Recherche « contient »** — l'autocomplete ne montre plus que les jeux dont le nom
  contient ce qui est tapé (insensible à la casse et aux accents) ; `/search` BGG est flou,
  le post-filtre honore la promesse.
- **Pseudo resserré** — 3 à 20 caractères : lettres, chiffres et `@ ! _` (le tiret disparaît,
  aucun pseudo existant concerné) ; **trim** à l'inscription et à la connexion (un espace
  copié-collé ne fait plus échouer).

### Corrigé
- **Entités numériques** — les titres BGG du type « l&#039;Art » s'affichaient en code
  numérique : décodage au point unique du parsing + backfill des fiches déjà stockées.

## [4.4.1] — 2026-10-06

### Corrigé
- **Pochettes BGG jamais rapatriées** — le parseur de `/thing` lisait l'image comme un
  attribut (`@_src`) alors que le XMLAPI2 réel la livre en contenu texte (épinglé sur une
  vraie réponse avec token, comme pour `/collection` en v4.3.1) : `imageUrl` valait toujours
  `null`, aucune pochette n'était téléchargée — ni à l'ajout ni à l'import. Le cache BGG
  (30 j) ayant conservé ces fiches amputées, il est purgé au déploiement ; les pochettes
  arrivent en relançant l'import (les jeux existants sont enrichis, sans doublon créé).

## [4.4.0] — 2026-10-05

### Ajouté
- **Autocomplete sur la recherche BGG** — la liste des correspondances apparaît sous le champ
  pendant la frappe (débounce 500 ms, dès 2 caractères) : `[pochette|♟] nom (année)`. L'année
  est donnée par `/search` (désormais parsée) ; les pochettes sont préchargées en fond via
  `/thing` (garde 1 req/s, cache 30 jours) et remplacent le ♟ au fil de l'eau — `/search` ne
  renvoie aucune image (contrainte API, épinglée sur les réponses réelles). Le bouton
  « Récupérer les infos » reste pour forcer.
- **« Powered by BoardGameGeek » sur la page de connexion** — attribution demandée par le
  client (le logo figure déjà sur la fiche jeu et le bouton BGG).

### Modifié
- L'écran « plusieurs correspondances » disparaît : la liste live le remplace et le choix est
  explicite — plus d'auto-navigation vers la fiche sur résultat unique.

## [4.3.1] — 2026-10-05

### Corrigé
- **Import BGG : « Aucun jeu possédé » malgré une collection remplie** — `parseCollectionXml`
  cherchait les valeurs en attributs (`<name value="…"/>`, forme de l'API *thing*) alors que
  l'endpoint `/collection` réel les renvoie en **contenu texte** (`<name sortindex="1">7 Wonders
  Duel</name>`). Toutes les lignes étaient écartées → liste vide. Le fixture de test de la v3.6.0
  décrivait une forme XML inexistante chez BGG : l'import n'avait jamais tourné contre de vraies
  données, faute d'auth. Éprouvé sur une vraie collection (72 jeux) ; le parseur accepte désormais
  les deux formes (texte d'abord, `@value`/`@_src` en repli).

## [4.3.0] — 2026-10-05

### Ajouté
- **Aperçus de partage (og:)** — les liens partagés (WhatsApp, Slack…) affichent enfin une
  carte : titre, description localisée et image. `og:image` est absolue grâce à `metadataBase`
  (`PUBLIC_URL`, fallback sur le domaine courant).

### Modifié
- **Nouvelles icônes** — nouveau logo partout : favicon (`.ico` + `.svg`), icônes PWA
  192/512, **icône maskable 512** (les fonds arrondis Android ne rognent plus le logo) et
  apple-touch-icon. Le manifest les déclare toutes.

## [4.2.2] — 2026-10-05

### Modifié
- **Nouveau domaine** — l'app déménage de `etagere.marc-suarez.fr` vers
  `what-shall-we-play.marco-studio.fr` : les partages WhatsApp (invitation, résultat)
  et les URLs des captures de bugs pointent vers le nouveau domaine. Côté VPS,
  l'ancien domaine redirige (301) vers le nouveau. `PUBLIC_URL` reste la variable
  de référence, le domaine en dur n'en est que le filet de sécurité.

## [4.2.1] — 2026-10-05

### Corrigé
- **Import BGG et recherche cassés** — BoardGameGeek verrouille désormais son API XML
  (401 sans authentification) : l'import de collection et la recherche répondaient
  « BGG ne répond pas ». Les appels repartent vers `boardgamegeek.com/xmlapi2` et un
  mode d'authentification de secours envoie un cookie de session BGG (`BGG_COOKIE` dans
  `.env`, git-ignoré) tant que le token développeur (`BGG_TOKEN`, inscription toujours
  en attente d'approbation) n'est pas disponible — le token reprendra la main dès obtention.

## [4.2.0] — 2026-10-04

### Ajouté
- **Corriger une partie** — sur la page d'une partie terminée, le créateur et les
  participants peuvent changer le jeu (les verdicts 😍🙂😐 sont réinitialisés, avec
  alerte), la date, les participants et les scores ; les stats de profils suivent.
- **Supprimer une partie** — confirmation qui liste exactement ce qui disparaît
  (scores, verdicts, historique de tirage) ; les tables liées partent en cascade.
- **Créer une partie passée** — depuis Mes parties, un seul geste : date passée,
  jeu, participants, scores optionnels. Pour les parties jouées sans l'app.
- Pastille « Scores à saisir » dans Mes parties pour les parties terminées sans scores.

## [4.1.0] — 2026-10-04

### Ajouté
- Tirage : un seul jeu dans la sélection → verdict direct, sans animation de roue
  (kicker « Une seule boîte en lice »).

### Modifié
- Le vocabulaire passe de « soirée » à « partie » partout (FR et EN « game ») :
  une partie peut se jouer à tout moment de la journée — libellés, erreurs,
  messages de partage WhatsApp, meta description et FAQ (« la partie du jour »
  remplace « le jeu du soir »).
- La section du jour du QG s'appelle « Aujourd'hui » (et plus « Ce soir »).

## [4.0.0] — 2026-10-04

### Ajouté
- **L'application parle anglais** — un sélecteur FR/EN (menu profil et accueil non connecté),
  un cookie `wsp_lang`, des dictionnaires maison typés (zéro dépendance) ; le français reste
  la langue par défaut.
  - Toute l'interface est traduite : étagère, ludothèque, soirées, tirage, verdicts, profil,
    FAQ, bugs.
  - La langue suit le compte (`users.lang`), posée au login.
  - Dates et nombres localisés.
  - Au passage, quelques accords de pluriel français corrigés (« 1 joueur » et non
    « 1 joueurs », « n'ont » et non « n'aont »).

## [3.8.0] — 2026-10-04

### Ajouté
- **FAQ** — une page publique qui répond aux 12 questions qu'on nous pose (compte, étagère,
  formats de boîte, verdicts…) ; liens depuis le menu et l'accueil.
  - Page publique `/faq` : 12 questions en 5 sections, dépliage en accordéon natif
    (`<details>`/`<summary>`), sans compte requis.
  - Liens d'accès : entrée « ❓ FAQ » du menu profil et bouton « ❓ Questions fréquentes » de
    l'accueil non connecté.

## [3.7.0] — 2026-10-04

### Ajouté
- **Le verdict du jeu 😍🙂😐** — après la soirée, chacun juge la boîte ; compteurs en direct,
  stats de profil, poids doux au tirage (max ×1,10 d'écart).
- **Le bloc verdict sur la nuit terminée, révocable** : trois pastilles sous la boîte jouée
  (😍 Adoré · 🙂 Bien · 😐 Neutre) avec les compteurs de la table en direct — re-voter remplace
  son verdict, et on ne voit jamais qui a voté quoi.
- **Les stats s'enrichissent** : « Tu as adoré Cascadia : 4 fois sur 5 » sur le profil, compteurs
  😍🙂😐 cumulés sur la fiche du jeu, et rappel « Donne ton verdict » dans Mes parties.
- **Poids doux au tirage** : le jeu 😍-dominant pèse ×1,08, le 😐-dominant ×0,98, les autres
  ×1,00 — bornes garantées [×0,98 ; ×1,08], l'animation de la roue ne change pas.

## [3.6.2] — 2026-10-04

### Modifié
- **CI plus rapide** : la suite ne tourne plus qu'une fois par itération de PR (le
  déclenchement `push` sur les branches de feature est supprimé — la PR suffit),
  un mini-job détecte les modifications purement documentation (`.md`, `docs/`,
  `captures-maquette/`) et saute alors build, tests et déploiement tout en gardant
  les checks verts, et le navigateur Playwright est mis en cache entre les runs.

### Corrigé
- **Release GitHub idempotente** : si la release existe déjà quand le workflow
  tourne (créée en parallèle du push du tag, ou relance après échec), l'étape est
  ignorée au lieu d'échouer en HTTP 422 « Release.tag_name already exists ».

## [3.6.1] — 2026-10-04

### Corrigé
- La pastille utilisateur (menu en haut à droite) se faisait compresser par les
  titres de page longs en viewport mobile — sur « Importer une collection »,
  l'icône, l'initiale et le carret se retrouvaient empilés sur deux lignes.
  Elle garde désormais sa taille intrinsèque sur toutes les pages ; un test E2E
  l'épingle.

## [3.6.0] — 2026-10-03

### Ajouté
- **Import de collection BGG** : depuis « Ajouter », un lien « Importer toute une
  collection » — ton pseudo BGG préremplit la ludothèque avec les jeux que tu
  possèdes. Preview avec pochettes et doublons repérés, format de boîte choisi
  globalement (défaut « grand ») et ajustable boîte par boîte, import ~1 s par jeu
  avec progression. Relançable à volonté : les jeux déjà présents sont ignorés et
  une fiche saisie à la main du même titre est enrichie (joueurs, durée, poids,
  pochette) plutôt que doublée — un échec ne bloque jamais le reste.

## [3.5.1] — 2026-10-02

### Corrigé
- **Le segmenté du pool s'affiche mal sur les écrans étroits** (issue #31,
  Galaxy S22 Ultra 412px) : les cellules « Tous les jeux / Votés 👍 » refusaient
  de rétrécir (`1fr` = minimum contenu) et débordaient de 52px. Les cellules sont
  rétractables (`minmax(0, 1fr)`) et le segmenté prend l'espace libéré.
- **Le bouton Lancer prenait trop de place** à côté du segmenté (228px) : il ne
  grossit plus au-delà de son texte (~106px). Libellé raccourci en « Tous · N ».

## [3.5.0] — 2026-10-02

### Ajouté
- **Vote sur l'étagère 👍** : chacun touche le badge d'une boîte pour voter
  (badge cuivré = ton vote), re-toucher retire son vote. Compteurs partagés en
  direct, modifiables jusqu'au lancement — même après avoir validé sa sélection.
- **Choix du pool au lancement** : quand au moins un jeu a un vote, le créateur
  tire parmi « Tous les jeux · N » ou « Votés 👍 · N » (défaut : tous). La roue
  reçoit simplement une liste plus courte ; sans vote, le lancement est inchangé.

## [3.4.0] — 2026-10-02

### Ajouté
- **« Rapporter un bug »** depuis le menu utilisateur : titre, type (🐛 bug /
  ✨ amélioration), description, capture jointe optionnelle. Les infos
  techniques partent automatiquement (version, page d'origine, appareil,
  écran, langue, app installée) et le serveur ouvre l'issue GitHub avec son
  label — confirmation avec le lien vers l'issue.
- Quota de 3 signalements par joueur et par jour ; les envois en échec ne
  consomment pas le quota.

## [3.3.1] — 2026-10-02

### Ajusté
- **Nouvelle icône de la PWA** — fournie par Marc : écran d'accueil iOS/Android
  (apple-touch + manifest 192/512) et favicon du navigateur.
- **L'onglet Étagère** porte 🗄️ dans la barre de navigation (fin du pion ♟).
- **Respirations** : espace entre « Mes parties » et « Changer mon code » sur le
  profil ; espace entre « Soirée du jour » et « Nouvelle partie » sur l'étagère.

## [3.3.0] — 2026-10-02

### Ajouté
- **La vie d'une partie en trois états** — en préparation, en jeu (la boîte sortie
  verrouille le jeu, plus de relance), terminée (scores enregistrés). Le badge
  d'état vit sur l'étagère, le tirage, les Parties et le profil.
- **Le carnet des scores** — « Partie terminée » ouvre la saisie : image du jeu,
  un joueur par ligne, médailles 👑🥈🥉 placées en direct, égalité = même médaille,
  « Terminer sans scores » pour les soirées sans compte.
- **L'historique qui raconte** — une carte par partie (la boîte sortie, le gagnant),
  et le détail avec le podium complet + partage WhatsApp.
- **Le profil à médailles** — podiums comptés dans les stats et « Mes parties »
  avec ma médaille par soirée.

### Corrigé
- **Fini l'accumulation de jeux aux relances** — relancer le tirage remplace le jeu
  pressenti ; une seule boîte peut sortir ; une seule ligne par partie dans
  l'historique.
- **« Sortir la boîte » est désormais le vrai début de partie** (état serveur,
  synchronisé en direct chez tous les joueurs), plus un simple effet visuel.

## [3.2.1] — 2026-10-01

### Corrigé
- **Le scroll vertical de la page passe au-dessus des rangées de boîtes**
  (signalement joueur) : un `touch-action: pan-x` hérité de l'ancien appui
  maintenu faisait que le navigateur n'acceptait que l'horizontal au-dessus
  des boîtes — tout geste vertical y était avalé. La rangée n'est plus un
  conteneur vertical (`overflow-y: clip`).

## [3.2.0] — 2026-10-01

### Ajouté
- **Les filtres de l'étagère dans le sélecteur** « Ajouter à la partie » : la
  même barre recherche + Filtres (joueurs, complexité, durée, boîte), avec le
  compteur « N jeux sur M dans ma ludothèque ». Un jeu sans donnée n'est jamais
  écarté par un filtre.

### Corrigé
- **Fini le scroll horizontal dans la feuille d'ajout** (signalement joueur) :
  la liste ne défile plus sur l'axe horizontal, les titres interminables sont
  ellipsés, et les champs de recherche passent à 16 px — iOS ne zoome plus la
  page au focus (le vrai coupable du « scroll horizontal »).

## [3.1.0] — 2026-10-01

### Changé
- **Barre d'action compacte de l'étagère** (maquette v310 validée) : une rangée
  d'action + au plus une ligne d'état (~150 px → 50–70 px). Quand tout le monde
  a validé, le lanceur passe au vert — le signal, sans texte. Le rappel « à
  re-valider » vit désormais sur le lien « + Ajouter d'autres jeux » ; l'invité
  validé voit « Lancement par Marc ».

### Corrigé
- **Picker : plus de saut de défilement** en ajoutant un jeu depuis la feuille
  (signalement joueur) : un seul conteneur de défilement, `overscroll-behavior:
  contain`, et la liste est remise exactement où le joueur l'avait laissée après
  l'ajout.

## [3.0.0] — 2026-10-01

### Changé (majeur — le flow du tirage change)
- **La sélection disparaît** : plus d'appui maintenu ni de compteur « Sélection : n ».
  L'étagère EST la sélection — le tirage se fait parmi **toutes les boîtes** qu'elle
  porte (les filtres restent une vue de navigation, jamais un filtre du tirage).
- **Un seul bouton, réservé au créateur** : « Lancer le tirage · n » — les autres
  joueurs voient une ligne d'attente : « Le tirage sera lancé par Marc ».
- La fiche d'un jeu perd « Ajouter à la sélection » ; elle garde « Retirer de la partie ».

### Ajouté
- **Valider sa sélection** (« chacun dit quand il est prêt ») : chaque joueur appuie
  sur « Valider ma sélection » — même sans boîte apportée. L'état est partagé en
  direct : chips ✓/⏳ et phrase « Léa a validé sa sélection » chez tout le monde.
- **Ajouter après avoir validé remet sa validation à zéro** : la sélection a changé,
  on re-confirme. Les autres ne bougent pas.
- **Le créateur voit l'état sous le lanceur** : « 2/3 prêts — Thib n'a pas validé » ;
  quand tout le monde a validé, « Tout le monde est prêt ! » et un appui lance.
  Il peut lancer sans l'accord de tous : double-appui « Sûr ? Lancer » (idiome maison).

## [2.1.0] — 2026-10-01

### Ajouté
- **Menu utilisateur sur toutes les pages** : la pastille (sticker + initiale) est en haut
  à droite de l'étagère, de la ludothèque, des parties, de l'ajout et du profil —
  Mon profil · Se déconnecter · version, partout. Un seul composant partagé (`UserMenu`).
- **Onboarding : l'emoji au compte créé** — la page « Créer un compte » propose la grille
  des 32 avatars (🎲 présélectionné), validée côté API ; modifiable au profil.
- **Foyer : le créateur retire un membre** — ✕ sur chaque autre membre, double-tap de
  confirmation ; la règle de sortie s'applique (ses ajouts le suivent, la collection
  commune reste). API `POST /api/foyers/members` + garde créateur.
- **Sync live de l'étagère (SSE)** — quand un joueur est ajouté à une partie ou qu'un
  jeu est posé/retiré, l'écran de chaque participant se met à jour toute seule (< 1 s),
  sans recharger — y compris la page « nouvelle partie » ouverte du joueur qu'on vient
  d'ajouter, qui bascule sur la partie en cours. Flux `GET /api/me/events` (SSE par
  utilisateur), bus événementiel partagé (`globalThis`), battement de cœur 30 s,
  reconnexion automatique ; marche à travers nginx (`X-Accel-Buffering: no`).

### Modifié
- **« Soirées » devient « Parties »** — l'onglet et tout le vocabulaire de l'app
  (Mes parties, Partie en cours, Créer la partie, Terminer la partie, annonce WhatsApp
  « Partie de jeux le… »). Rien ne change en base.

## [2.0.0] — 2026-10-01

### Changement de flux (maquette validée)
- **L'étagère d'une soirée est vide à la création.** Chaque joueur y ajoute, depuis
  SA ludothèque (jeux perso + ceux de son foyer) et sur son téléphone, ce dont il a
  envie de jouer ce soir — l'étagère se remplit au fil des arrivées.
- **Nouveau sélecteur « Ajouter à la soirée »** (bottom-sheet) : ma ludothèque groupée
  par format, recherche insensible aux accents, tap = ajout (✓ vert), compteur en direct.
- **« Pas ce soir » disparaît** : un jeu n'est sur l'étagère que si quelqu'un l'a voulu ;
  écarter un jeu ce soir = « Retirer de la soirée » (fiche du jeu, n'importe quel joueur).
- **Badge « Apporté par » = qui a posé la boîte** (l'ajouteur à la soirée, pas le
  propriétaire de la fiche) ; un doublon d'ajout est ignoré, le premier ajouteur garde le badge.
- La sélection (appui maintenu), le tirage et WhatsApp restent inchangés ; un lien
  « + Ajouter d'autres jeux » reste disponible en cours de soirée.

### Technique
- Table `night_games` (night, jeu, ajouteur) ; API `POST /api/nights/[id]/games`
  (`{ gameId, added }`) avec gardes : joueur de la soirée + jeu de SA ludothèque ;
  route « excludes » supprimée (table `night_excludes` conservée pour l'historique).
- Suites : 88 unitaires (+3 gardes étagère) / 37 E2E (sélecteur, retrait, étagère vide) ; tsc propre.

## [1.6.1] — 2026-10-01

### Modifié
- **Panneau de création de foyer plus lisible** : plus d'espace, icône en pastille, boutons aérés, code d'invitation plus grand, liste des membres plus respirente.

### Ajouté
- **`AGENTS.md`** : principes de travail du dépôt — KISS fondamental, politique de release (major/minor/patch selon la demande), documentation systématique.

## [1.6.0] — 2026-10-01

### Ajouté
- **Foyer : une bibliothèque partagée** — en couple ou en colocation, créez un foyer depuis « Mon profil » et partagez une seule collection : chacun ajoute, modifie, écarte. L'étagère d'une soirée réunit les collections des joueurs et de leurs foyers, même si un membre est absent.
- **Adhésion par code d'invitation** : « Créer un foyer » génère un code à 6 caractères (sans O/0, I/1) à dicter de vive voix ; l'autre membre le saisit dans son profil. Le code reste visible dans le foyer pour inviter plus tard.
- **Fusion guidée des bibliothèques** : à l'adhésion, les doublons de titre (casse et accents ignorés) se trient un à un — garder la fiche de l'un, de l'autre, ou les deux. La fiche conservée absorbe l'historique de tirages de l'autre.
- **Quitter / dissoudre** : quitter emporte les jeux que j'ai ajoutés ; dissoudre (créateur) rend chaque jeu à son ajouteur. Supprimer son compte laisse la collection du foyer aux autres membres.
- **Ma ludothèque affiche le foyer** : ligne « Foyer · nom · N membres » sous le titre, et badge de l'ajouteur en coin de pochette.

## [1.5.0] — 2026-10-01

### Ajouté
- **Recherche et filtres sur la bibliothèque** : barre de contrôles partagée avec l'étagère, plus une famille propre à la ludothèque — format de **boîte** (Grand/Moyen/Petit/Mini). Compteur « N jeux sur M » et lien « Tout afficher » quand des filtres mordent.
- **Terminer la soirée** : depuis le QG, le créateur clôture la soirée en cours (double-tap de confirmation) — l'étagère redevient vierge, la soirée rejoint l'historique, rien n'est supprimé.

### Modifié
- **Filtres repliés par défaut** : sur l'étagère comme sur la ludothèque, une seule rangée (recherche + bouton « Filtres » badgeant les familles actives) ; le détail se déplie au tap. La liste est le héros.
- **Filtres de l'étagère repensés** : contrôles segmentés étiquetés (Joueurs, Complexité, Durée) — plus lisibles, deux fois moins hauts, un tap pour changer de valeur.
- **« Ma bibliothèque » devient « Ma ludothèque »** (onglet + titre), et les cartes passent en trois zones : identité (pochette, titre, année · éditeur), traits (format encadré cuivre, joueurs, durée, poids), filet d'actions (sélecteur de format à gauche, « Pas ce soir » à droite).
- **QG Soirées repensé** : « Ce soir » devient la carte vivante à liseré cuivre ; les programmées affichent la date en héros (numéro du jour, mois, heure en badge) ; l'historique passe en rangées compactes scannables.

### Corrigé
- **Étagère : la barre « Sélection + Lancer le tirage » reste visible** pendant qu'on fait défiler les boîtes — elle était collée en bas du flux, hors écran. La bannière du mode sélection aussi (fixée en haut).
- **Aucun filtre appliqué par défaut** sur l'étagère : toute la collection s'affiche à l'ouverture ; le filtre joueurs de la soirée reste disponible au tap.
- **Plus de rebond de page** (PWA iOS) : le rebond élastique est désactivé — fini le scroll parasite sur les pages courtes comme le profil.

## [1.4.0] — 2026-10-01

### Ajouté
- **Soirées programmées** : programmez une soirée (date + heure + joueurs) depuis le QG. Le jour J, elle devient la soirée en cours automatiquement.
- **QG Soirées** repensé : « Ce soir » (soirée en cours et son verdict), « Programmées » (cartes avec date longue, heure, joueurs), « Historique ». La nuit active couvre désormais les participants, pas seulement les créateurs.
- **Annonce WhatsApp au verdict** : « 💬 Annoncer sur WhatsApp » compose le message (jeu tiré, qui ramène, qui est attendu, heure) et l'envoie via le partage natif — sinon lien wa.me. Aucun bot, aucun compte.
- **Invitation WhatsApp** sur chaque soirée programmée : date, heure et joueurs invités pré-remplis.

## [1.3.0] — 2026-10-01

### Ajouté
- **« Pas ce soir »** : écarte un jeu du tirage de la soirée depuis la fiche (étagère) ou les cartes de bibliothèque — portée soirée seulement, de retour demain. Section « Écartés ce soir » en bas de l'étagère pour les remettre.
- **Recherche et filtres sur l'étagère** : recherche (casse et accents ignorés), filtres joueurs (pré-rempli avec la soirée en cours), complexité (légère/moyenne/lourde) et durée (< 30 / 30–60 / 60+). Un jeu sans donnée n'est jamais écarté par un filtre.
- **Badge « apporté par »** sur chaque boîte : sticker ou photo du propriétaire, en coin de boîte.
- **Spinner discret** pendant le chargement des pochettes de l'étagère, fondu à l'arrivée.

## [1.2.1] — 2026-10-01

### Corrigé
- **Recadrage photo** : la photo s'affichait à sa taille naturelle (zoom implicite ×10 sur un téléphone) — l'affichage est désormais piloté par la même math que l'enregistrement (`lib/crop.ts`) : zoom minimum = photo cadrée juste, ce que tu vois = ce qui est enregistré.
- **Recadrage fiable** : le bouton « Recadrer ✓ » attend que la photo soit décodée (plus d'écran figé si on valide trop vite sur une grosse photo).
- **Caméra iOS** : les inputs photo ne sont plus en `display:none` (le `.click()` programmatique était aléatoire sur iOS).
- **Long press tactile** : appui maintenu robuste sur iPhone — fallback `touchstart` (vieux WebKit sans pointer events), `touch-action: pan-x` sur les boîtes (le navigateur ne transforme plus un maintien en scroll/zoom), et un `pointercancel` tardif d'un maintien réel déclenche quand même la sélection (`lib/press.ts`).

## [1.2.0] — 2026-10-01

### Ajouté
- **Page profil** (via le menu utilisateur → « Mon profil ») : avatar, pseudo, statistiques (parties jouées · soirées · jeux), changement de code, suppression de compte.
- **Avatar personnel** : sticker emoji au choix (grille de 32) ou photo (appareil ou galerie) avec **recadrage carré** (glisser + zoom, sortie 256×256) ; il remplace le dé dans les chips de joueurs, le menu et l'historique des soirées.
- **Changement de code** en 3 étapes (code actuel vérifié, confirmation du nouveau).
- **Suppression du profil** : avertissement détaillé + code secret exigé ; supprime le compte, la collection et les tirages — les soirées des autres sont conservées (cascade en transaction, fichiers avatar/pochettes nettoyés).
- **Sélection par longue pression** : maintenir une boîte 400 ms sur l'étagère entre en mode sélection (bandeau cuivre, toucher = ajouter/retirer, « Terminé » pour sortir) ; l'appui simple ouvre toujours la fiche.

### Modifié
- **Codes secrets = 4 chiffres** à l'inscription, au changement et à la validation de suppression (saisie type PIN, clavier numérique, 4 cases) ; la vérification à la connexion reste inchangée (bcrypt) et l'audit v1.2.0 confirme que les comptes existants utilisent déjà 4 chiffres.
- API `GET/PATCH/DELETE /api/me`, `POST /api/me/avatar`, `POST /api/me/code` ; colonnes `users.sticker` / `users.avatar_path` (migrations idempotentes).

## [1.1.0] — 2026-09-30

### Ajouté
- **Fiche jeu enrichie** (bottom-sheet) : complexité (poids BGG), « best joueurs » (sondage communautaire BGG, parseur prêt — se remplit dès que `BGG_TOKEN` est en place), créateur, illustrateur, **parties jouées** (nombre de tirages locaux) ; colonnes `designer`/`artist`/`best_players` (migration idempotente).
- **Logo officiel « Powered by BoardGameGeek »** sur le lien BGG de la fiche.
- **Ajout de jeu repensé** : titre + formats de boîte à l'échelle réelle + bouton « Récupérer les infos » (logo BGG intégré) → la fiche se remplit depuis BGG (année, éditeur, joueurs, durée, complexité, note, créateur, illustrateur, pochette remplaçable par une photo) ; saisie manuelle conservée en secours.
- **Navigation par onglets** en bas : Étagère · Bibliothèque · Ajouter · Soirées (masquée pendant la roue et hors session) ; menu utilisateur réduit à la déconnexion.
- **Ma bibliothèque détaillée** : cartes avec pochette, année · éditeur, joueurs, durée ; la fiche complète s'ouvre au toucher ; format et retrait restent en un geste.
- **Version affichée** dans le menu utilisateur ; nom de cache du service worker versionné automatiquement à chaque build (`wsp-v<version>`).
- Données des 29 jeux du fondateur complétées (crédits, poids, notes, best, formats de boîte).

### Corrigé
- Pochettes portrait qui débordaient de leur boîte sur l'étagère (image en flux absolu ; hauteur `100 %` non résolue dans une piste de grille auto).
- Étagère périmée ~30 s après un changement de format en bibliothèque (`staleTimes.dynamic = 0`).
- Titre « Ajouter un jeu » perdu dans la refonte du formulaire.

## [1.0.0] — 2026-09-30

### Ajouté
- **Comptes** : inscription/connexion par pseudo + code secret (bcrypt, sessions cookie 30 j).
- **Bibliothèque par joueur** : ajout manuel ou via recherche BoardGameGeek (préremplissage de la fiche, pochette rapatriée localement, cache 30 jours) ; édition du format de boîte ; suppression (refusée si le jeu a déjà été tiré).
- **Soirées** : on coche les joueurs présents — l'étagère combine les bibliothèques de tout le monde ; « journée » en heure Europe/Paris.
- **L'Étagère (accueil)** : rayons en scroll horizontal groupés par format de boîte (grand/moyen/petit/mini à taille relative réelle), fiche détail en bottom-sheet, sélection par bordure cuivrée + pastille ✓, CTA « Lancer le tirage · N ».
- **Tirage** : hasard cryptographique côté serveur (`node:crypto`), enregistré en base avant l'affichage ; roue plein écran cosmétique qui atterrit sur le jeu tiré ; verdict « LA ROUE A PARLÉ » avec vibration, « Sortir la boîte », « Relancer le tirage ».
- **Historique** des soirées (date, joueurs, jeux tirés).
- **PWA installable** : manifest + service worker minimal (cache statique et pochettes uniquement).
- **Déploiement** : Dockerfile multi-stage (node:22-alpine, sortie standalone, tzdata), docker-compose avec volume `./data`, README d'exploitation (reverse proxy HTTPS, sauvegarde SQLite).
- **CI** : build (Next.js + image Docker), tests (Vitest + Playwright), déploiement VPS sur push de main.

### Périmètre v1 (choix assumés)
- Tous les inscrits se voient entre eux (pas d'amis), pas de scores/stats, pas d'offline complet, pas d'i18n (français uniquement), pas d'admin.
- La recherche BGG fonctionne sans token d'application ; un `BGG_TOKEN` (header Bearer) est utilisé automatiquement s'il est configuré.
