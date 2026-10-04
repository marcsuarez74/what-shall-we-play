# Traduction EN — Plan d'implémentation (v4.0.0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toute l'UI disponible en anglais (sélecteur FR/EN, cookie `wsp_lang` + préférence compte), sans changer une route ni un sélecteur E2E — les 65 E2E restent vertes en français par défaut.

**Architecture:** Dictionnaires statiques typés (`lib/i18n/fr.ts` source de vérité, `en.ts: typeof fr` — clé manquante = erreur tsc), `t()` maison + `LanguageProvider` client alimenté par le layout, `getLang()` serveur (cookie → compte → `'fr'`), colonne `users.lang`. Extraction par zones, chaque tâche laisse la suite verte.

**Tech Stack:** Next.js App Router, React Context, Intl (dates/nombres), vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-04-traduction-en-design.md`

**Prérequis:** v3.7.0 (verdict) et v3.7.1 (FAQ) **fusionnées** — leurs chaînes (VerdictBloc, page FAQ) sont dans le périmètre (T3 et T8).

## Global Constraints

- UI **française par défaut** : sans cookie, tout reste exactement comme aujourd'hui — c'est ce qui garde les ~20 specs E2E (accrochées aux libellés FR) vertes sans retouche.
- Zéro dépendance i18n externe (next-intl, i18next interdits).
- `en.ts` typé `typeof fr` : toute clé manquante ou en trop = échec `npx tsc --noEmit`.
- Les **données** ne se traduisent pas (titres de jeux, pseudos, notes utilisateurs).
- Les hooks E2E (`aria-label`, rôles) sont traduits avec l'UI — mais comme les tests tournent en FR (défaut), leurs sélecteurs restent valides ; règle AGENTS.md §3 : si un test casse, mise à jour dans le même commit.
- Garde-fou AGENTS.md réécrit dans T9 : « UI **française par défaut**, anglais intégralement supporté ».
- Version finale : **4.0.0** (MAJOR — l'UI peut changer de langue).

## Review Focus

1. **Cookie absent** — attendu : français partout, `users.lang` ignoré tant que le cookie n'existe pas (le compte ne force pas la langue d'un navigateur partagé). → testé T1.
2. **Langue invalide dans le cookie** (`wsp_lang=xx`) — attendu : repli `'fr'`, jamais de crash. → testé T1.
3. **Pluriels et verbes accordés** (`1 jeu / 3 jeux`, `ont/est de la partie`) — attendu : formes EN correctes via fonctions `(vars) => string`, pas de concat « jeu + s ». → testé T1 (exemple auth) puis chaque zone.
4. **Messages d'erreur API en EN** — attendu : la route lit le cookie et renvoie l'erreur dans la langue du navigateur (pattern `getLang()`), le client les affiche tels quels. → testé T3 (soirées) et T6 (BGG).
5. **Partage WhatsApp EN** — `lib/announce.ts` produit des textes EN complets (pas de mélange FR/EN dans un message). → testé T3.
6. **`<html lang>`** — attendu : `lang="en"` quand le cookie dit EN (accessibilité + hygiène). → testé T1.

---

### Task 1: Infra i18n de bout en bout (prouvée sur la zone auth)

**Files:**
- Create: `lib/i18n/fr.ts`, `lib/i18n/en.ts`, `lib/i18n/index.ts`, `lib/i18n/format.ts`, `components/LanguageProvider.tsx`, `components/LanguageSwitch.tsx`, `app/api/lang/route.ts`
- Modify: `lib/db.ts` (migration `users.lang`), `lib/i18n` consommé par `app/layout.tsx` (`<html lang>`), `components/AuthForm.tsx` + `components/PinInput.tsx` (première zone traduite), `app/api/auth/*` erreurs, `lib/session.ts` non touché
- Test: `tests/unit/i18n.test.ts` (create), `tests/e2e/i18n.spec.ts` (create)

**Interfaces:**
- Produces (tout le reste du plan s'appuie dessus) :
  - `type Lang = 'fr' | 'en'` ; `DICTS: Record<Lang, Dict>` où `Dict = typeof fr`
  - `getLang(): Promise<Lang>` — serveur (pages, layout, routes API) : cookie `wsp_lang` validé ∈ {fr,en} → sinon `'fr'` ; `setLangCookie` côté route
  - `t(lang, clé, vars?): string` — clés plates `'auth.creer'`, valeurs `string | ((vars: Record<string, string | number>) => string)`
  - `useI18n(): { lang: Lang; t: (clé: CléDict, vars?) => string }` — client (Context)
  - `formatDate(lang, date)` / `formatNombre(lang, n)` — remplace les `Intl.DateTimeFormat('fr-FR',…)` (app/nights/page.tsx:13-15, app/nights/[id]/page.tsx:31, ProfileClient.tsx:21) et `toLocaleString('fr-FR')` (TirageClient.tsx:10, GameSheet.tsx:6, LibraryClient.tsx:86, AddGameForm.tsx:186-187)

- [ ] **Step 1: Tests (échouent)** — `tests/unit/i18n.test.ts` :

```ts
import { t, DICTS, type Lang } from '@/lib/i18n';

it('le dict EN est complet (typage) et le repli FR marche', () => {
  expect(t('en', 'auth.creer')).toBe(DICTS.en['auth.creer']);
  expect(DICTS.fr['auth.creer']).toBe('Créer mon compte');
});
it('pluriels par fonction, pas par concat', () => {
  expect(t('fr', 'ludotheque.nbJeux', { n: 1 })).toBe('1 jeu');
  expect(t('fr', 'ludotheque.nbJeux', { n: 3 })).toBe('3 jeux');
  expect(t('en', 'ludotheque.nbJeux', { n: 3 })).toBe('3 games');
});
it('langue invalide → fr', () => {
  expect(estLangValide('xx')).toBe(false);
});
```

- [ ] **Step 2: FAIL** — Run: `npx vitest run tests/unit/i18n.test.ts` → FAIL

- [ ] **Step 3: Implémenter l'infra**

`lib/i18n/fr.ts` — clés plates par domaine, amorce avec le domaine auth **complet** (AuthForm : « Pseudo », « Code secret — 4 chiffres », « Créer mon compte », « Se connecter », « J'ai déjà un compte », « Pas encore de compte ? », « Mon pseudo », erreurs `lib/auth.ts:32,40` « Pseudo déjà pris », « Identifiants incorrects »…) + la clé pluriel exemplaire :

```ts
export const fr = {
  'auth.creer': 'Créer mon compte',
  'auth.pseudo': 'Pseudo',
  'auth.codeSecret': 'Code secret — 4 chiffres',
  // …
  'ludotheque.nbJeux': ({ n }: { n: number }) => `${n} jeu${n > 1 ? 'x' : ''}`,
} as const;
export type CléDict = keyof typeof fr;
```

`lib/i18n/en.ts` : `export const en: Record<CléDict, string | ((vars: any) => string)> = { 'auth.creer': 'Create my account', …, 'ludotheque.nbJeux': ({ n }) => `${n} game${n > 1 ? 's' : ''}` }` — puis `export const DICTS = { fr, en }` dans index.ts (le typage exact doit forcer la complétude : ajuster avec `satisfies` si besoin pour que `en` manque une clé = erreur).

`lib/i18n/index.ts` :

```ts
import { cookies } from 'next/headers';
export type Lang = 'fr' | 'en';
export const LANG_COOKIE = 'wsp_lang';
export function estLangValide(v: string | undefined): v is Lang {
  return v === 'fr' || v === 'en';
}
export async function getLang(): Promise<Lang> {
  const store = await cookies();
  const v = store.get(LANG_COOKIE)?.value;
  return estLangValide(v) ? v : 'fr';
}
export type ValeurDict = string | ((vars: Record<string, string | number>) => string);
export function t(lang: Lang, clé: CléDict, vars?: Record<string, string | number>): string {
  const v = DICTS[lang][clé] as ValeurDict;
  return typeof v === 'function' ? v(vars ?? {}) : v;
}
```

`components/LanguageProvider.tsx` : `'use client'`, `createContext`, `useI18n()` — alimenté par `app/layout.tsx` : `const lang = await getLang()` → `<html lang={lang}>` + `<LanguageProvider lang={lang}>…`. `components/LanguageSwitch.tsx` : deux boutons FR/EN (`aria-pressed`), `POST /api/lang` puis `router.refresh()`. `app/api/lang/route.ts` : POST `{ lang }` → valide → `NextResponse` pose le cookie (`maxAge` 1 an, `path: '/'`) + si session : `UPDATE users SET lang = ?`. Migration `lib/db.ts` dans `runMigrations` (pattern try/catch existant) : `ALTER TABLE users ADD COLUMN lang TEXT NOT NULL DEFAULT 'fr'`. **Au login/register** : si `users.lang` du compte est `'en'`, poser le cookie dans la réponse (`NextResponse.cookies.set`) — c'est le seul endroit où le compte influence le navigateur (Review Focus n°1).

- [ ] **Step 4: Traduire la zone auth + brancher** — AuthForm/PinInput via `useI18n()`, erreurs des routes auth via `t(await getLang(), 'auth.errPseudoPris')` etc. `PinInput` garde son `aria-label={label}` prop (l'interface `getByLabel('Code secret')` est passée par AuthForm qui traduit).

- [ ] **Step 5: E2E smoke EN + régression FR** — `tests/e2e/i18n.spec.ts` :

```ts
test('EN : le formulaire d inscription est en anglais', async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: 'wsp_lang', value: 'en', url: 'http://localhost:3000' }]);
  const page = await ctx.newPage();
  await page.goto('/register');
  await expect(page.getByRole('button', { name: 'Create my account' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});
```

Run: `npx vitest run && npx tsc --noEmit && npx playwright test tests/e2e/i18n.spec.ts tests/e2e/parcours.spec.ts` → PASS (parcours reste FR/vert sans cookie)

- [ ] **Step 6: Commit**

```bash
git add lib/i18n lib/db.ts components/LanguageProvider.tsx components/LanguageSwitch.tsx components/AuthForm.tsx components/PinInput.tsx app/layout.tsx app/api/lang tests/
git commit -m "feat(i18n): infra dictionnaires typés + sélecteur, zone auth traduite"
```

### Task 2: Zone étagère

**Files:** Modify: `components/ShelfClient.tsx` (~26 chaînes), `ShelfControls.tsx` (~12), `ShelfPicker.tsx` (~9), `TermineeCard.tsx` (~3), `Wheel.tsx` (~3), `UserSync.tsx` (~6), `TabBar.tsx` (4 : Étagère/Ludothèque/Ajouter/Parties), `UserMenu.tsx` (~7), `app/etagere/page.tsx` (`<h1>L'étagère</h1>` l.28)
- [ ] **Step 1:** Extraire → domaine `etagere.*` dans `fr.ts` (attention : `ShelfClient.tsx:240` « ont/'' pas encore validé » → clé fonction `{ n }`) ; traduire EN.
- [ ] **Step 2:** Brancher `useI18n()` / `t(lang, …)` ; les `aria-label` composés (« Avatars ${s} », libellés de filtres) passent par des clés à variables.
- [ ] **Step 3:** Run: `npx vitest run && npx tsc --noEmit && npx playwright test tests/e2e/etagere.spec.ts tests/e2e/votes.spec.ts tests/e2e/lancement.spec.ts` → PASS (aucune spec modifiée)
- [ ] **Step 4:** Commit — `feat(i18n): zone étagère en EN`

### Task 3: Zone soirées + tirage (+ verdict, annonce)

**Files:** Modify: `app/nights/page.tsx` (le plus gros server component FR, ~20 chaînes, dates l.13-15 → `formatDate`), `app/nights/[id]/page.tsx` (~10), `components/ScoreCarnet.tsx` (~5), `TerminerNight.tsx`, `NightPlanner.tsx`, `InviteButton.tsx`, `NightPicker.tsx`, `VerdictBloc.tsx`, `TirageClient.tsx` (~31, `toLocaleString` l.10 → `formatNombre`), `PartagerResultats.tsx`, `lib/nights.ts` (erreurs), `lib/verdicts.ts` (erreurs), `lib/draw.ts` (`'sélection vide'`), `lib/announce.ts` (textes WhatsApp complets : passer `lang`, `frJoin` → jointure EN « and »)
- [ ] **Step 1:** Extraire → domaines `soiree.*`, `tirage.*`, `verdict.*`, `annonce.*` + traduire (pluriels `sont/est` → `are/is`, `partie/parties`).
- [ ] **Step 2:** Server components : `const lang = await getLang()` puis `t(lang, …)` ; routes : idem (Review Focus n°4).
- [ ] **Step 3:** Run: `npx vitest run && npx tsc --noEmit && npx playwright test tests/e2e/soirees.spec.ts tests/e2e/nights.spec.ts tests/e2e/tirage.spec.ts tests/e2e/etats-scores.spec.ts tests/e2e/verdict.spec.ts` → PASS. + un test dans `tests/e2e/i18n.spec.ts` (Review Focus n°4) : avec cookie `en`, déclencher une erreur API (ex. tirage sur une soirée vide) → le message affiché est en anglais.
- [ ] **Step 4:** Commit — `feat(i18n): zones soirées, tirage et verdict en EN`

### Task 4: Zone ludothèque + import BGG

**Files:** Modify: `components/LibraryClient.tsx` (pluriel `jeu{x}` l.45 → `ludotheque.nbJeux` de T1), `GameSheet.tsx` (~9, `toLocaleString` l.6), `AddGameForm.tsx` (~47, `toLocaleString` l.186-187), `DedupeFlow.tsx` (pluriel l.57), `ImportBggClient.tsx` (~43, pluriels l.137), `lib/formats.ts` (`FORMAT_LABEL`/`FORMAT_SHORT` → `libellésFormats(lang)`), `lib/games.ts` (erreurs), `lib/bgg.ts` (erreurs — dont « BGG prépare ta collection » l.170)
- [ ] **Step 1:** Extraire → domaines `ludotheque.*`, `ajout.*`, `import.*`, `formats.*` + erreurs `bgg.*` ; traduire EN (vocabulaire board-game courant : box, shelf, wishlist…).
- [ ] **Step 2:** Brancher ; `FORMAT_SHORT` consommé par DedupeFlow/ImportBggClient/LibraryClient/ShelfControls → passer `lang` (ou `useI18n`) à l'affichage, garder les valeurs SQL `'mini'|'petit'…` **inchangées** (ce sont des données, pas des libellés).
- [ ] **Step 3:** Run: `npx vitest run && npx tsc --noEmit && npx playwright test tests/e2e/biblio.spec.ts tests/e2e/ajout.spec.ts tests/e2e/import-bgg.spec.ts tests/e2e/etagere-ajouts.spec.ts` → PASS
- [ ] **Step 4:** Commit — `feat(i18n): zones ludothèque et import BGG en EN`

### Task 5: Zone profil, foyer, bugs

**Files:** Modify: `components/ProfileClient.tsx` (~40, date l.21 → `formatDate`), `FoyerCard.tsx` (~21), `BugReportClient.tsx` (~39), `app/profil/page.tsx` + `app/bugs/page.tsx` (metadata → `generateMetadata` avec lang), `lib/foyers.ts`, `lib/bugs.ts`, `lib/users.ts` (erreurs)
- [ ] **Step 1:** Extraire → domaines `profil.*`, `foyer.*`, `bugs.*` + traduire.
- [ ] **Step 2:** Brancher (server metadata : `export async function generateMetadata()` + `getLang()`).
- [ ] **Step 3:** Run: `npx vitest run && npx tsc --noEmit && npx playwright test tests/e2e/profil.spec.ts tests/e2e/profil-photo.spec.ts tests/e2e/foyer.spec.ts tests/e2e/bugs.spec.ts` → PASS
- [ ] **Step 4:** Commit — `feat(i18n): zones profil, foyer et bugs en EN`

### Task 6: FAQ bilingue + rattrapage global

**Files:** Modify: `app/faq/page.tsx` (12 Q/R traduites — `faq.*`, `lang` via `getLang()` : le contenu EN est une vraie rédaction, pas une traduction mot à mot), `components/OwnerBadge.tsx`, `components/RegisterSW.tsx`
- [ ] **Step 1:** Traduire la FAQ + les restes.
- [ ] **Step 2: Balayage global** — `grep -rnE "[ÀÂÇÉÈÊËÎÏÔÙÛÜŒ]" app/ components/ lib/ --include='*.tsx' --include='*.ts' | grep -v i18n | grep -v '// ' | grep -v test` : **chaque hit restant** est soit une donnée (commentaire FR — OK), soit une chaîne oubliée (à extraire). Zéro littéral FR visible restant hors `lib/i18n/`.
- [ ] **Step 3:** Run: suite complète `npx vitest run && npx tsc --noEmit && npx playwright test` → PASS (2420 lignes d'E2E inchangées)
- [ ] **Step 4:** Commit — `feat(i18n): FAQ bilingue + balayage des littéraux restants`

### Task 7: Garde-fou, version, release notes

**Files:** Modify: `AGENTS.md` (§4 : « UI 100 % français » → « UI **française par défaut**, anglais intégralement supporté ; les données ne se traduisent pas »), `package.json` (4.0.0), `CHANGELOG.md`
- [ ] **Step 1:** Entrée CHANGELOG : « L'app parle anglais — sélecteur FR/EN (menu, accueil), préférence mémorisée ; tout est traduit, les données restent les tiennes. »
- [ ] **Step 2:** Suite complète verte, commit `chore(release): v4.0.0 — l'app devient bilingue`
