# Design — Le verdict du jeu 😍🙂😐 (v3.7.0)

Date : 2026-10-04 · Statut : spec validée en maquette (`maquette-v37-verdict.html`,
session `.superpowers/brainstorm/24329-1791114664/content/`) · Backlog #4

## Problème

Après la partie, rien ne retient si la boîte a plu. Les stats de profil ignorent le ressenti
(« tu as adoré Cascadia 4 fois sur 5 » n'existe pas) et le tirage reste aveugle : la roue peut
reproposer à l'infini une boîte que tout le monde boude, ou rater celle que le groupe adore.

## Compréhension validée

- Après la soirée, chaque joueur donne un verdict à trois niveaux : 😍 adoré / 🙂 bien / 😐 neutre.
- Ça alimente les stats (profil + fiche jeu) et pèse **doucement** sur les futurs tirages —
  la roue garde sa surprise (garde-fou chiffré du backlog, arbitré le 2026-10-04 : écart
  relatif max ≈ ×1,10 entre le plus et le moins aimé).
- Le vote est **révocable** (revoter remplace), comme le vote étagère de v3.5.0.

## Décisions validées en brainstorming

1. **Moment et lieu** : sur la **page de la nuit terminée**, asynchrone — chaque joueur connecté
   vote quand il veut ; rappel discret tant qu'il n'a pas voté (badge sur « Mes parties »).
   Pas dans le carnet de scores (seul le créateur y est généralement), pas via WhatsApp
   (page publique = plus d'infra).
2. **Qui vote** : les joueurs connectés de la nuit (`night_players`). Les invités sans compte
   (backlog #2) brancheront dessus plus tard — le modèle d'identité (user_id) est prêt.
3. **Poids au tirage — continu + confiance** (choix client « plus fin que 3 paliers ») :
   - `score = (😍 − 😐) / total_verdicts_du_jeu ∈ [−1, +1]`, `n` = nombre de verdicts ;
   - multiplicateur : `1 + 0,08 · score · min(1, n/3)` si score > 0 (max ×1,08) ;
     `1 + 0,02 · score · min(1, n/3)` si score < 0 (min ×0,98) ; sans verdict → ×1,00 ;
   - un seul verdict pèse un tiers, trois ou plus pleins effet ; **pas de fenêtre glissante**
     (refusé en brainstorming : complexité non justifiée en v1) ;
   - borne dans le garde-fou du backlog : écart max ×1,08 / ×0,98 ≈ ×1,10 ✓ (asymétrie
     volontaire : biais positif, la surprise d'un jeu jamais joué reste entière).
4. **Confidentialité du groupe** : le bloc affiche les **compteurs** (😍×2 · 🙂×1 · 😐×0),
   jamais qui a voté quoi.
5. **La roue ne change pas visuellement** : `pickGameId` devient un échantillonnage pondéré,
   l'animation et le « jeu pressenti » restent ce qu'ils sont.

## Architecture

```
POST /api/nights/[id]/verdict ── gardes : session → 401 ; membre de la nuit → 403 ;
  │                              nuit status='termine' + game_id → 409 sinon
  ├─ lib/verdicts.ts : poserVerdict(nightId, userId, verdict)
  │    → UPSERT night_verdicts (game_id copié de nights.game_id) → notifyNight → refresh live
  └─ tirage (app/api/nights/[id]/draw) : getVerdictWeights(gameIds) → pickWeightedGameId
```

- **Table `night_verdicts`** : `night_id`, `user_id`, `game_id` (dénormalisé — les agrégats
  évitent les jointures), `verdict TEXT CHECK IN ('adore','bien','neutre')`, `created_at`,
  `UNIQUE(night_id, user_id)`. Jumeau structurel de `game_votes` (v3.5.0).
- **Agrégats affichés** : profil (« tu as adoré Cascadia : 4 fois sur 5 » — verdicts personnels
  toutes soirées), fiche jeu (GameSheet : ligne d'humeur à côté de « Parties jouées »),
  rappel « donne ton verdict » sur Mes parties tant que non voté.
- Le poids s'applique dès le premier verdict ; le neutre n'est ni un oui ni un non,
  il équilibre le score vers 0.

## Nouvelles pièces

| Pièce | Rôle |
|---|---|
| `lib/db.ts` : table `night_verdicts` | migration idempotente, pattern `game_votes` |
| `lib/verdicts.ts` | `poserVerdict` (UPSERT + résolution `nights.game_id`), `verdictsDeNuit`, `poidsVerdicts(gameIds)` → Map(id → multiplicateur), `verdictPerso(userId, gameId)` (profil/fiche) |
| `app/api/nights/[id]/verdict/route.ts` | POST fine : gardes puis `poserVerdict` ; erreurs explicites (401/403/409) |
| `lib/draw.ts` | `pickGameId` → échantillonnage pondéré (`pickWeightedGameId`) ; unitaire pur, testable sans DB |
| `components/VerdictBloc.tsx` | le bloc de la maquette : 3 pastilles (aria `Verdict : adoré/bien/neutre`), compteurs groupe, confirmation, éditable |
| `app/nights/[id]/page.tsx` | le bloc quand `status='termine'` (pattern votes v3.5 : POST mince → notifyNight → refresh) |
| `components/ProfileClient.tsx`, `components/GameSheet.tsx`, Mes parties | agrégats + rappel |
| `CHANGELOG.md`, `package.json` | v3.7.0 (MINOR : nouvelle fonctionnalité) |

## Tests

- **Unit** (`tests/unit/verdicts.test.ts`) : `poidsVerdicts` — bornes ×1,08/×0,98, confiance
  min(1, n/3), score nul → ×1,00, sans verdict → ×1,00 ; `pickWeightedGameId` (déterministe
  via injection du hasard) ; `poserVerdict` — remplacement (révocable), game_id copié,
  gardes 401/403/409.
- **E2E** (`tests/e2e/verdict.spec.ts`, gabarit votes) : deux joueurs live sur la nuit terminée —
  vote, changement d'avis, compteurs en direct chez l'autre (refresh) ; non-membre → 403.
  Effet poids : mock des poids dans le contexte tirage (jamais de dépendance à BGG ni au hasard).

## Hors périmètre (v1)

- Fenêtre glissante / décote des vieilles parties ; verdicts des invités (backlog #2) ;
  affichage nominatif des verdicts ; toute variation du garde-fou chiffré.
