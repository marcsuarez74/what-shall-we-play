# Design — FAQ (v3.7.1)

Date : 2026-10-04 · Statut : spec validée en maquette (`maquette-faq.html`,
session `.superpowers/brainstorm/24329-1791114664/content/`) · Backlog #11

## Problème

Un nouveau venu (ou un curieux avant inscription) n'a nulle part où comprendre l'app :
c'est quoi le jeu du soir, pourquoi un pseudo et un code secret, comment marche le vote,
la roue, les formats de boîte. Chaque question finit en message privé au créateur.

## Compréhension validée

- Une page **publique** (lisible sans connexion — le public n°1 est le curieux avant inscription).
- Le contenu est le cœur de la feature : le backlog dit « à glisser au fil de l'eau, quand le
  contenu existe » — le 1ᵉʳ jet est rédigé et **validé en maquette** par le client.

## Décisions validées en brainstorming

1. **Contenu** : 1ᵉʳ jet par l'agent, corrections du client — **12 questions en 5 sections**.
   Ajout demandé en relecture : la section **« Les boîtes & la taille »** (formats exacts de
   `lib/formats.ts` : Mini / Petit / Moyen / Grand · 30×30, regroupement d'étagère, filtres,
   correction depuis la ludothèque, format par défaut à l'import BGG).
2. **Forme** : accordéon natif `<details>/<summary>` — zéro JS, accessible, palette
   noyer/crème/cuivre. Certaines entrées ouvertes par défaut (les deux « porte d'entrée »).
3. **Accès** : lien « ❓ FAQ » dans le **menu du profil** (connecté) + bouton
   « Questions fréquentes » sur l'**accueil non connecté**.
4. **Ton** : les réponses annoncent honnêtement ce qui arrive (invités « en préparation »),
   chiffrent ce qui est chiffré (poids des verdicts ≈ 10 % max d'écart).

## Contenu validé (les 12 questions)

1. **Le jeu du soir** — C'est quoi What Shall We Play ? · C'est quoi l'étagère ? ·
   Comment marche le vote 👍 ? · La roue peut-elle refuser nos favoris ?
2. **Ton compte** — Comment se créer un compte ? (pseudo + code secret 4 chiffres, pas d'e-mail)
3. **Ta ludothèque** — Comment ajouter ses jeux ? (à la main ou import BGG) ·
   Qui peut modifier ou supprimer quoi ? (suppressions explicites et confirmées)
4. **Les boîtes & la taille** — C'est quoi les formats de boîte ? ·
   Je peux corriger la taille d'un jeu ?
5. **La roue & les verdicts** — C'est quoi le verdict 😍🙂😐 ? · Comment on note la soirée ? ·
   Et les amis sans compte ? (en préparation)

## Nouvelles pièces

| Pièce | Rôle |
|---|---|
| `app/faq/page.tsx` | page publique statique (metadata fr), sections + accordéons |
| `components/ProfileClient.tsx` | entrée « ❓ FAQ » dans le menu (motif du lien existant) |
| page d'accueil non connectée | bouton « Questions fréquentes » (motif bouton ligne validé) |
| `CHANGELOG.md`, `package.json` | v3.7.1 (MINOR : nouvelle page publique) |

## Tests

- **E2E** (`tests/e2e/faq.spec.ts`) : `/faq` servie sans session (200, titre visible) ;
  ouverture/fermeture d'un accordéon (hook `aria-label` stable) ; lien joignable depuis le
  menu profil et depuis l'accueil non connecté.
- **Unit** : rien — la page est statique (le contenu est validé par le client, pas calculé).

## Hors périmètre (v1)

- Recherche dans la FAQ, ancres profondes, compteur de vues, FAQ multilingue (viendra avec
  la traduction v4.0.0 — le contenu est déjà rédigé dans les deux registres de ton).
