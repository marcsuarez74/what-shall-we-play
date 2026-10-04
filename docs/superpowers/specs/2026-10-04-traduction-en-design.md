# Design — Traduction de l'app : anglais (v4.0.0)

Date : 2026-10-04 · Statut : design validé en brainstorming (pas de maquette — l'UI est
inchangée ; le sélecteur suit le motif du lien FAQ validé en maquette)

## Problème

L'app est verrouillée en français (garde-fou « UI 100 % français »). Les amis non francophones
et le public BGG (anglophone) ne peuvent pas l'utiliser. Le client veut ouvrir l'app —
en anglais d'abord.

## Compréhension validée

- L'anglophone doit pouvoir faire **tout le parcours** : compte, étagère, vote, soirée, tirage,
  scores, verdict, ludothèque, import BGG, FAQ, profil — sans jamais retomber en français.
- Le client **choisit sa langue** (pas d'auto-détection seule) ; la préférence se retient.
- Les **données** restent telles quelles : titres de jeux, pseudos, notes — on traduit le
  chrome, pas le contenu des utilisateurs.

## Décisions validées en brainstorming

1. **Langue** : anglais **seul** en v1 (français + anglais). L'infra permettra d'en ajouter
   sans refonte, mais on n'en traduit aucune autre maintenant.
2. **Choix de langue** : sélecteur **FR/EN** dans le menu du profil (connecté) et sur l'accueil
   non connecté ; mémorisé dans un **cookie** (`wsp_lang`, 1 an) ; connecté, la préférence
   persiste aussi sur le compte. **Aucune URL par locale** — chaque route, lien et redirect
   resterait à doubler, et le SEO n'est pas l'enjeu (app authentifiée + page FAQ publique).
3. **Ampleur** : **tout d'un coup** (choix explicite du client) — une seule version, expérience
   jamais mixte en production. Pendant la branche, le repli français garantit zéro chaîne
   manquante à l'écran.
4. **Zéro dépendance** : dictionnaires statiques + une fonction `t()` maison (~30 lignes).
   Pas de next-intl/i18next : aucune abstraction au-delà du besoin démontré.
5. **Les tests ne bougent pas** : les 65 E2E épinglent la langue **française** (cookie posé
   dans le contexte Playwright) — sélecteurs texte et `aria-label` restent stables
   (interface E2E préservée). 2-3 tests EN de fumée en plus (accueil, inscription, FAQ).
6. **Garde-fou** : l'AGENTS.md passe de « UI 100 % français » à « UI **française par défaut**,
   anglais intégralement supporté » — réécrit dans la PR (avec l'accord du client, demandeur).
7. **Version** : **v4.0.0** — MAJOR : l'UI peut changer de langue, changement de comportement
   assumé (et symbolique : l'app devient bilingue).

## Architecture

```
lib/i18n/fr.ts   ← source de vérité, clés par domaine (auth.*, etagere.*, soiree.*,
lib/i18n/en.ts      tirage.*, ludotheque.*, import.*, faq.*, profil.*, erreurs.*)
                   en.ts est typé `typeof fr` : une clé manquante = erreur tsc à la compilation.
lib/i18n/index.ts : getLang() (serveur : cookies() → compte), t(lang, clé, vars?)
                     + repli FR si clé absente (sécurité, jamais testée en prod car tsc)
components/LanguageProvider.tsx : Context client alimenté par le layout (lang + dict courant)
components/LanguageSwitch.tsx   : le sélecteur FR/EN (POST mince → cookie + compte → refresh)
```

- **Serveur** : chaque page/route lit la langue via `getLang()` (cookie, puis compte connecté)
  et passe le dict aux composants client par le Provider — un seul point de vérité.
- **Chaînes à variables** : `t('soiree.verdictQuestion', { jeu })` — les pluriels français
  existants (nKo>1 etc.) gardent leur logique, doublée EN.
- **Arabic/CSS** : rien — FR/EN partagent la direction LTR et la grille.

## Nouvelles pièces

| Pièce | Rôle |
|---|---|
| `lib/i18n/{fr,en,index}.ts`, Provider, LanguageSwitch | l'infra (une tâche à elle seule) |
| ~40 fichiers UI (pages + composants) | extraction des chaînes vers les dicts — par zone : auth/accueil → étagère → soirée/tirage → ludothèque/import → profil/FAQ → erreurs |
| `lib/db.ts` + route profil | colonne `lang` sur users (mise à jour via le sélecteur) |
| `playwright.config.ts` (+ helpers) | contexte E2E avec cookie `wsp_lang=fr` |
| `tests/e2e/i18n.spec.ts` | smoke EN : accueil, inscription, FAQ — titres EN visibles |
| `AGENTS.md` | garde-fou réécrit (§4) |
| `CHANGELOG.md`, `package.json` | v4.0.0 |

## Risques & parade

- **Volume** (~40 fichiers) : le plus gros chantier du projet. Parade : exécution SDD par zones,
  revue par tâche, et la complétude EN garantie par `tsc` (typage `typeof fr`) — impossible de
  livrer une clé manquante.
- **Régressions de texte** (chaînes interpolées, pluriels) : chaque zone relue en FR (zéro
  changement visible) puis en EN ; les E2E FR épinglées attrapent toute casse de sélecteur.
- **Chaînes oubliées** en dur : revue par zone avec un grep des littéraux français restants
  dans les composants touchés (le repli FR rend l'oubli invisible en prod — d'où le grep).

## Hors périmètre (v1)

- Autres langues (espagnol…), détection navigateur, URL par locale, traduction des données
  utilisateurs, recherche BGG dans une autre langue (les requêtes BGG restent telles quelles).
