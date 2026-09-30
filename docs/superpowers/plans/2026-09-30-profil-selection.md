# Profil & sélection longue pression — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Page profil (sticker/photo de avatar, stats, changement de code, suppression de compte) + sélection sur l'étagère par longue pression (400 ms), avec codes secrets limités à 4 chiffres.

**Architecture:** Logique métier dans `lib/users.ts` (nouveau) testée en unitaire via Vitest (DB temporaire `DATA_DIR`), routes API fines dans `app/api/me/**` gardées par `getSessionUser()`, UI = Server Component `/profil` + `ProfileClient` (client). Les avatars réutilisent le stockage pochettes (`lib/storage.ts` + route `/api/cover/[name]`). Le long press se branche sur les `<button class="box">` existants de `ShelfClient` (pointer events + timer).

**Tech Stack:** Next.js App Router, better-sqlite3, bcryptjs, Vitest, Playwright.

**Spec:** Maquette validée `.superpowers/brainstorm/52992-1790804838/content/profil-selection-v3.html` (v3 = v2 + marges corrigées). Décisions validées par l'utilisateur :
1. Codes = **4 chiffres uniquement** (saisie PIN 4 cases) — inscription, changement, suppression. Connexion : UI PIN, vérif serveur inchangée (bcrypt).
2. Longue pression **400 ms** sur une boîte → mode sélection (tap = toggle, bandeau cuivre, « Terminé »). Appui simple = fiche (inchangé).
3. Avatar = sticker emoji (grille de 32) **ou** photo (appareil/galerie → recadrage carré 256×256). Remplace le 🎲 dans les chips de joueurs, le user-chip, l'historique.
4. Suppression : avertissement + PIN → supprime profil + collection + tirages ; les soirées créées par d'autres restent.
5. Accès profil via menu utilisateur (pas de 5e onglet).

## Global Constraints

- UI 100 % français. Palette noyer `#2A1F17` / surface `#3A2B1F` / crème `#F3E9DC` / cuivre `#C96F3B` / vert `#3E9B6E` / rouge `#C74B3C`. Fonts Bricolage Grotesque (`--font-display`) + Space Grotesk (`--font-ui`).
- Migrations DB : pattern existant « try/catch sur ALTER » dans `getDb()` (`lib/db.ts`). Jamais de destructif.
- Tests unitaires : Vitest, DB temporaire via `vitest.setup.ts` (`process.env.DATA_DIR`). `fileParallelism: false`.
- E2E : Playwright, auth par l'UI d'inscription (`getByLabel('Pseudo')` / `getByLabel('Code secret')` — **compatibilité obligatoire** avec les specs existantes).
- Fichiers uploadés : ≤ 5 Mo, jpg/jpeg/png/webp, stockés via `saveCover()` (`lib/storage.ts`), servis via `/api/cover/[name]`.
- `.selbadge` est volontairement hors du `.box` (`top:-8px`) → ne PAS ajouter `overflow:hidden` sur `.box`.
- Version : bump `package.json` → `1.2.0` (le SW suit via `scripts/sync-sw-version.mjs`).

## Review Focus

1. **Suppression incomplète** : un compte avec jeux tirés par d'autres (picks RESTRICT sur `game_id`) doit être supprimable → l'ordre des DELETE est critique (picks d'abord). Test : Task 3.
2. **Code non numérique** : `validateCode` doit rejeter `abcd`, `12345`, `123` → regex exacte `^[0-9]{4}$`. Test : Task 2.
3. **Long press vs fiche** : après un long press déclenché, le `click` qui suit le `pointerup` ne doit PAS ouvrir la fiche (double action). Test : Task 9 (E2E + `suppressClickRef`).
4. **Compat E2E existante** : `getByLabel('Code secret')` doit rester unique et remplissable par `fill('1234')` → seul le 1er PIN a ce label exact. Vérifié en relançant toute la suite E2E : Task 6.
5. **Avatar orphelin** : remplacer/supprimer un avatar doit effacer l'ancien fichier disque. Test : Task 4.

---

### Task 1: Schéma (sticker, avatar_path) + lib/users.ts (stats, sticker)

**Files:**
- Modify: `lib/db.ts` (bloc migrations)
- Modify: `lib/types.ts`
- Create: `lib/users.ts`
- Test: `tests/unit/users.test.ts`

**Interfaces:**
- Produces: `ALLOWED_STICKERS: string[]` (32 emojis), `getProfileStats(userId: number): { plays: number; nights: number; games: number }`, `setSticker(userId: number, sticker: unknown): { ok: true } | { error: string; status: number }`, `UserRow.sticker?: string | null`, `UserRow.avatar_path?: string | null`, `UserLite.sticker?: string | null`, `UserLite.avatar_path?: string | null`.

- [ ] **Step 1: Écrire le test qui échoue**

```ts
// tests/unit/users.test.ts
import { describe, it, expect } from 'vitest';
import { registerUser } from '@/lib/auth';
import { createNight } from '@/lib/nights';
import { createGame, recordPick } from '@/lib/games'; // recordPick si existant, sinon INSERT direct
import { getDb } from '@/lib/db';
import { getProfileStats, setSticker, ALLOWED_STICKERS } from '@/lib/users';

const uid = (p: string) => (registerUser(p, '1234') as { id: number }).id;

describe('profil', () => {
  it('stats : plays / nights / games', () => {
    const marc = uid('p-marc');
    const lea = uid('p-lea');
    const g1 = createGame(marc, { title: 'Dune', box_format: 'grand' }) as number;
    const g2 = createGame(marc, { title: 'Meadow', box_format: 'moyen' }) as number;
    const n1 = createNight(marc, [marc, lea]);
    createNight(lea, [lea]);
    getDb().prepare('INSERT INTO picks (night_id, game_id, spinner_id) VALUES (?, ?, ?)').run(n1, g1, marc);
    getDb().prepare('INSERT INTO picks (night_id, game_id, spinner_id) VALUES (?, ?, ?)').run(n1, g2, marc);
    expect(getProfileStats(marc)).toEqual({ plays: 2, nights: 1, games: 2 });
    expect(getProfileStats(lea)).toEqual({ plays: 0, nights: 2, games: 0 });
  });

  it('setSticker accepte un emoji de la liste et rejette le reste', () => {
    const marc = uid('p-stick');
    expect(setSticker(marc, '🦊')).toEqual({ ok: true });
    expect((getDb().prepare('SELECT sticker FROM users WHERE id = ?').get(marc) as { sticker: string }).sticker).toBe('🦊');
    expect(setSticker(marc, '<script>')).toEqual({ error: 'Sticker inconnu', status: 400 });
    expect(setSticker(marc, 42)).toEqual({ error: 'Sticker inconnu', status: 400 });
  });

  it('la liste de stickers contient 32 emojis dont le dé', () => {
    expect(ALLOWED_STICKERS).toHaveLength(32);
    expect(ALLOWED_STICKERS).toContain('🎲');
  });

  it('migrations : colonnes users.sticker et users.avatar_path', () => {
    const cols = (getDb().pragma('table_info(users)') as { name: string }[]).map((c) => c.name);
    expect(cols).toContain('sticker');
    expect(cols).toContain('avatar_path');
  });
});
```

> Adapter : si `createGame` ne renvoie pas l'id, lire `lib/games.ts` et ajuster ; le `recordPick` peut ne pas exister → l'INSERT direct ci-dessus est la référence.

- [ ] **Step 2: Vérifier l'échec** — Run: `npx vitest run tests/unit/users.test.ts` → FAIL (module `@/lib/users` introuvable).

- [ ] **Step 3: Implémenter**

```ts
// lib/db.ts — dans le tableau des migrations existant, ajouter :
  'ALTER TABLE users ADD COLUMN sticker TEXT',
  'ALTER TABLE users ADD COLUMN avatar_path TEXT',
```

```ts
// lib/types.ts
export interface UserRow { id: number; pseudo: string; code_hash: string; created_at: string;
  sticker?: string | null; avatar_path?: string | null; }
export interface UserLite { id: number; pseudo: string; sticker?: string | null; avatar_path?: string | null; }
```

```ts
// lib/users.ts
import { getDb } from './db';

export const ALLOWED_STICKERS = [
  '🎲','🃏','♟️','🧩','🎯','🏆','⚔️','🐉','🚀','🌙','🍀','🦊','🐙','🪐','🎩','👑',
  '🤖','🦖','🌴','⛺','🔮','🧲','🎪','🦉','🐝','⭐','🎰','🧸','🛸','🐢','⚡','🏰',
];

export function getProfileStats(userId: number): { plays: number; nights: number; games: number } {
  const db = getDb();
  const one = (sql: string) =>
    Number((db.prepare(sql).get(userId) as { n: number }).n);
  return {
    plays: one('SELECT COUNT(*) AS n FROM picks WHERE spinner_id = ?'),
    nights: one('SELECT COUNT(*) AS n FROM night_players WHERE user_id = ?'),
    games: one('SELECT COUNT(*) AS n FROM games WHERE owner_id = ?'),
  };
}

export function setSticker(userId: number, sticker: unknown): { ok: true } | { error: string; status: number } {
  if (typeof sticker !== 'string' || !ALLOWED_STICKERS.includes(sticker))
    return { error: 'Sticker inconnu', status: 400 };
  getDb().prepare('UPDATE users SET sticker = ?, avatar_path = NULL WHERE id = ?').run(sticker, userId);
  return { ok: true };
}
```

- [ ] **Step 4: Vérifier le passage** — Run: `npx vitest run tests/unit/users.test.ts` → 4 PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: colonnes sticker/avatar_path + stats profil (lib/users)"`

---

### Task 2: Code à 4 chiffres + changement de code

**Files:**
- Modify: `lib/auth.ts:12-15` (validateCode)
- Modify: `lib/users.ts` (changeCode)
- Test: `tests/unit/auth.test.ts` (adapter les codes non numériques existants), `tests/unit/users.test.ts`

**Interfaces:**
- Produces: `validateCode(c: unknown): string | null` (4 chiffres exactement), `changeCode(userId: number, current: unknown, next: unknown): { ok: true } | { error: string; status: number }`.

- [ ] **Step 1: Tests qui échouent**

```ts
// tests/unit/auth.test.ts — AJOUTER (et remplacer tout code non numérique des tests existants par '1234' / '5678') :
describe('validateCode 4 chiffres', () => {
  it('accepte 4 chiffres', () => expect(validateCode('1234')).toBeNull());
  it('rejette lettres', () => expect(validateCode('abcd')).toMatch('4 chiffres'));
  it('rejette 3 chiffres', () => expect(validateCode('123')).toMatch('4 chiffres'));
  it('rejette 5 chiffres', () => expect(validateCode('12345')).toMatch('4 chiffres'));
});
```

```ts
// tests/unit/users.test.ts — AJOUTER :
import { changeCode, verifyLogin } from '@/lib/auth'; // verifyLogin vient de @/lib/auth
it('changeCode : courant requis, 4 chiffres, effectif', () => {
  const u = uid('p-code');
  expect(changeCode(u, '9999', '5678')).toEqual({ error: 'Code actuel incorrect', status: 401 });
  expect(changeCode(u, '1234', '567')).toEqual({ error: 'Nouveau code : 4 chiffres', status: 400 });
  expect(changeCode(u, '1234', '5678')).toEqual({ ok: true });
  expect(verifyLogin('p-code', '5678')).toEqual({ id: u });
  expect(verifyLogin('p-code', '1234').status).toBe(401);
});
```

- [ ] **Step 2: Vérifier l'échec** — `npx vitest run tests/unit/auth.test.ts tests/unit/users.test.ts` → FAIL.

- [ ] **Step 3: Implémenter**

```ts
// lib/auth.ts — remplacer validateCode :
export function validateCode(c: unknown): string | null {
  if (typeof c !== 'string' || !/^[0-9]{4}$/.test(c)) return 'Code secret : 4 chiffres';
  return null;
}
```

```ts
// lib/users.ts — ajouter :
import bcrypt from 'bcryptjs';
import { validateCode } from './auth';
import type { UserRow } from './types';

export function changeCode(userId: number, current: unknown, next: unknown): { ok: true } | { error: string; status: number } {
  const row = getDb().prepare('SELECT code_hash FROM users WHERE id = ?').get(userId) as UserRow | undefined;
  if (!row || !bcrypt.compareSync(String(current ?? ''), row.code_hash))
    return { error: 'Code actuel incorrect', status: 401 };
  if (typeof next !== 'string' || !/^[0-9]{4}$/.test(next))
    return { error: 'Nouveau code : 4 chiffres', status: 400 };
  getDb().prepare('UPDATE users SET code_hash = ? WHERE id = ?').run(bcrypt.hashSync(next, 10), userId);
  return { ok: true };
}
```

- [ ] **Step 4: Tout le unitaire passe** — `npm test` → PASS (adapter si un test existant utilisait un code non numérique).
- [ ] **Step 5: Commit** — `git commit -am "feat: codes à 4 chiffres + changement de code vérifié"`

---

### Task 3: Suppression de compte (cascade + fichiers)

**Files:**
- Modify: `lib/users.ts`
- Test: `tests/unit/users.test.ts`

**Interfaces:**
- Produces: `deleteAccount(userId: number): { ok: true; removedGames: number }` — supprime picks (sienne + ceux visant ses jeux), ses nuits créées, son user (cascades sessions/night_players/games), et les fichiers disque (avatar + pochettes de ses jeux).

- [ ] **Step 1: Test qui échoue**

```ts
// tests/unit/users.test.ts — AJOUTER :
import { deleteAccount } from '@/lib/users';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR_TEST } from './helpers'; // ou path.resolve('.tmp-vitest') directement

it('deleteAccount : tout part, les soirées des autres restent', () => {
  const marc = uid('p-del-marc');
  const lea = uid('p-del-lea');
  const g = createGame(marc, { title: 'À supprimer', box_format: 'grand' }) as number;
  const nMarc = createNight(marc, [marc, lea]);
  const nLea = createNight(lea, [lea, marc]);
  getDb().prepare('INSERT INTO picks (night_id, game_id, spinner_id) VALUES (?, ?, ?)').run(nMarc, g, marc);
  getDb().prepare('INSERT INTO picks (night_id, game_id, spinner_id) VALUES (?, ?, ?)').run(nLea, g, lea);
  const res = deleteAccount(marc);
  expect(res).toEqual({ ok: true, removedGames: 1 });
  const cnt = (sql: string) => Number((getDb().prepare(sql).get() as { n: number }).n);
  expect(cnt('SELECT COUNT(*) AS n FROM users WHERE id = ' + marc)).toBe(0);
  expect(cnt('SELECT COUNT(*) AS n FROM games')).toBe(0);
  expect(cnt('SELECT COUNT(*) AS n FROM picks')).toBe(0); // ceux de marc (nMarc) et ceux visant son jeu
  expect(cnt(`SELECT COUNT(*) AS n FROM nights WHERE id = ${nLea}`)).toBe(1); // la soirée de léa reste
  expect(cnt(`SELECT COUNT(*) AS n FROM night_players WHERE night_id = ${nLea}`)).toBe(1); // sans marc
});
```

- [ ] **Step 2: Vérifier l'échec** — `npx vitest run tests/unit/users.test.ts` → FAIL (deleteAccount inconnu).
- [ ] **Step 3: Implémenter**

```ts
// lib/users.ts — ajouter :
import fs from 'node:fs';
import { coverPathOnDisk } from './storage';

export function deleteAccount(userId: number): { ok: true; removedGames: number } {
  const db = getDb();
  const files: string[] = [];
  const user = db.prepare('SELECT avatar_path FROM users WHERE id = ?').get(userId) as { avatar_path: string | null } | undefined;
  if (user?.avatar_path) files.push(coverPathOnDisk(user.avatar_path));
  for (const c of db.prepare('SELECT cover_path FROM games WHERE owner_id = ?').all(userId) as { cover_path: string | null }[])
    if (c.cover_path) files.push(coverPathOnDisk(c.cover_path));

  const removedGames = Number((db.prepare('SELECT COUNT(*) AS n FROM games WHERE owner_id = ?').get(userId) as { n: number }).n);
  db.transaction(() => {
    // 1) picks visant MES jeux (RESTRICT sinon) — peu importe qui a fait tourner
    db.prepare('DELETE FROM picks WHERE game_id IN (SELECT id FROM games WHERE owner_id = ?)').run(userId);
    // 2) mes tirages sur les jeux des autres
    db.prepare('DELETE FROM picks WHERE spinner_id = ?').run(userId);
    // 3) mes soirées créées (cascades picks + night_players de ces soirées)
    db.prepare('DELETE FROM nights WHERE creator_id = ?').run(userId);
    // 4) moi (cascades sessions, night_players, games)
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  })();
  for (const f of files) { try { fs.unlinkSync(f); } catch { /* déjà absent */ } }
  return { ok: true, removedGames };
}
```

- [ ] **Step 4: PASS** — `npx vitest run tests/unit/users.test.ts` → PASS. Puis `npm test` complet.
- [ ] **Step 5: Commit** — `git commit -am "feat: suppression de compte en cascade (profil + collection + tirages)"`

---

### Task 4: Avatar photo (upload + remplacement + nettoyage)

**Files:**
- Modify: `lib/users.ts`
- Modify: `lib/formats.ts` (helper `avatarSrc`)
- Test: `tests/unit/users.test.ts`

**Interfaces:**
- Produces: `setAvatar(userId: number, buf: Buffer, ext: string): { ok: true; path: string } | { error: string; status: number }` (écrase l'ancien fichier, met `avatar_path`, vide `sticker`) ; `avatarSrc(u: { avatar_path?: string | null; sticker?: string | null }): string | null` dans `lib/formats.ts`.

- [ ] **Step 1: Test qui échoue**

```ts
// tests/unit/users.test.ts — AJOUTER :
import { setAvatar } from '@/lib/users';
import { avatarSrc } from '@/lib/formats';

it('setAvatar enregistre le fichier et remplace l ancien', () => {
  const u = uid('p-av');
  const fake = Buffer.from('fakejpg1');
  const r1 = setAvatar(u, fake, 'jpg');
  if (!('ok' in r1)) throw new Error('upload 1 refusé');
  expect((getDb().prepare('SELECT avatar_path FROM users WHERE id = ?').get(u) as { avatar_path: string }).avatar_path).toBe(r1.path);
  const r2 = setAvatar(u, fake, 'png');
  if (!('ok' in r2)) throw new Error('upload 2 refusé');
  expect(fs.existsSync(path.join(process.env.DATA_DIR!, 'covers', r1.path))).toBe(false); // ancien effacé
  expect(avatarSrc({ avatar_path: r2.path, sticker: '🦊' })).toBe(`/api/cover/${r2.path}`);
  expect(avatarSrc({ avatar_path: null, sticker: '🦊' })).toBeNull();
  expect(setAvatar(u, fake, 'exe')).toEqual({ error: 'Format : jpg, png ou webp', status: 400 });
});
```

- [ ] **Step 2: Vérifier l'échec** — FAIL.
- [ ] **Step 3: Implémenter**

```ts
// lib/formats.ts — ajouter :
export function avatarSrc(u: { avatar_path?: string | null; sticker?: string | null }): string | null {
  return u.avatar_path ? `/api/cover/${u.avatar_path}` : null;
}
```

```ts
// lib/users.ts — ajouter :
import { saveCover, coverPathOnDisk } from './storage';

const AVATAR_EXT = ['jpg', 'jpeg', 'png', 'webp'];
export function setAvatar(userId: number, buf: Buffer, ext: string): { ok: true; path: string } | { error: string; status: number } {
  if (!AVATAR_EXT.includes(ext)) return { error: 'Format : jpg, png ou webp', status: 400 };
  const prev = (getDb().prepare('SELECT avatar_path FROM users WHERE id = ?').get(userId) as { avatar_path: string | null }).avatar_path;
  const name = saveCover(buf, ext as 'jpg' | 'jpeg' | 'png' | 'webp');
  getDb().prepare('UPDATE users SET avatar_path = ?, sticker = NULL WHERE id = ?').run(name, userId);
  if (prev) { try { fs.unlinkSync(coverPathOnDisk(prev)); } catch { /* absent */ } }
  return { ok: true, path: name };
}
```

- [ ] **Step 4: PASS** — puis `npm test`.
- [ ] **Step 5: Commit** — `git commit -am "feat: avatar photo (upload, remplacement, nettoyage fichier)"`

---

### Task 5: Routes API /api/me

**Files:**
- Create: `app/api/me/route.ts` (GET, PATCH, DELETE)
- Create: `app/api/me/avatar/route.ts` (POST multipart)
- Create: `app/api/me/code/route.ts` (POST)

**Interfaces:**
- Consomme: `getProfileStats`, `setSticker`, `setAvatar`, `changeCode`, `deleteAccount`, `getSessionUser` (lib/session), `cookieOpts`/`COOKIE_NAME` (lib/session).
- GET → `{ id, pseudo, sticker, avatar_path, stats }` ; PATCH JSON `{ sticker }` ; POST avatar FormData `{ avatar: File }` ≤ 5 Mo ; POST code JSON `{ current, next }` ; DELETE JSON `{ code }` → vérif bcrypt + `deleteAccount` + cookie supprimé.

- [ ] **Step 1: Implémenter** (la logique est déjà testée ; routes fines, E2E les couvre en Task 7/9)

```ts
// app/api/me/route.ts
import { NextResponse } from 'next/server';
import { getSessionUser, cookieOpts, COOKIE_NAME } from '@/lib/session';
import { getProfileStats, setSticker, deleteAccount } from '@/lib/users';
import { verifyLogin } from '@/lib/auth';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  return NextResponse.json({
    id: user.id, pseudo: user.pseudo, sticker: user.sticker ?? '🎲', avatar_path: user.avatar_path ?? null,
    stats: getProfileStats(user.id),
  });
}

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const { sticker } = await req.json();
  const r = setSticker(user.id, sticker);
  if (!('ok' in r)) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const { code } = await req.json();
  const check = verifyLogin(user.pseudo, code);
  if ('error' in check) return NextResponse.json({ error: 'Code incorrect' }, { status: 401 });
  deleteAccount(user.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, '', { ...cookieOpts(), maxAge: 0 });
  return res;
}
```

```ts
// app/api/me/avatar/route.ts
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { setAvatar } from '@/lib/users';

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const form = await req.formData();
  const file = form.get('avatar');
  if (!(file instanceof File) || file.size === 0)
    return NextResponse.json({ error: 'Aucune image reçue' }, { status: 400 });
  if (file.size > 5 * 1024 * 1024)
    return NextResponse.json({ error: 'Image : 5 Mo maximum' }, { status: 400 });
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const r = setAvatar(user.id, Buffer.from(await file.arrayBuffer()), ext);
  if (!('ok' in r)) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, path: r.path });
}
```

```ts
// app/api/me/code/route.ts
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { changeCode } from '@/lib/users';

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const { current, next } = await req.json();
  const r = changeCode(user.id, current, next);
  if (!('ok' in r)) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Typecheck + tests** — `npx tsc --noEmit && npm test` → OK.
- [ ] **Step 3: Commit** — `git commit -am "feat: API /api/me (profil, sticker, avatar, code, suppression)"`

---

### Task 6: PinInput (4 cases) + AuthForm

**Files:**
- Create: `components/PinInput.tsx`
- Modify: `components/AuthForm.tsx`
- Modify: `app/globals.css` (styles `.pin`)

**Interfaces:**
- Produces: `<PinInput label="Code secret" value={code} onChange={setCode} autoComplete="current-password" />` — 4 `<input inputMode="numeric">`, le 1er porte `aria-label={label}` (**unique** — compat E2E `getByLabel('Code secret')`), les suivants `aria-label={\`${label} ${i + 1}\`}`. `onChange` reçoit la valeur complète (0–4 chiffres). `fill('1234')` sur la 1re case → `onChange('1234')`.

- [ ] **Step 1: Implémenter**

```tsx
// components/PinInput.tsx
'use client';
import { useRef } from 'react';

export default function PinInput({ label, value, onChange, autoComplete }: {
  label: string; value: string; onChange: (v: string) => void; autoComplete?: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  function setDigit(i: number, raw: string) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length > 2) {                     // fill / collage multi-chiffres
      onChange(digits.slice(0, 4));
      refs.current[Math.min(digits.length, 3)]?.focus();
      return;
    }
    if (digits.length === 2) {                   // frappé par-dessus un chiffre existant
      const c = digits[1];
      onChange((value.slice(0, i) + c + value.slice(i + 1)).slice(0, 4));
      refs.current[Math.min(i + 1, 3)]?.focus();
      return;
    }
    if (digits.length === 1) {
      onChange((value.slice(0, i) + digits + value.slice(i + 1)).slice(0, 4));
      refs.current[Math.min(i + 1, 3)]?.focus();
      return;
    }
    onChange(value.slice(0, i) + value.slice(i + 1)); // effacement
  }
  return (
    <div className="pin" role="group" aria-label={label}>
      {[0, 1, 2, 3].map((i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }} inputMode="numeric" pattern="[0-9]*" maxLength={4}
               aria-label={i === 0 ? label : `${label} ${i + 1}`} autoComplete={i === 0 ? autoComplete : 'off'}
               value={value[i] ?? ''} onChange={(e) => setDigit(i, e.target.value)}
               onKeyDown={(e) => {
                 if (e.key === 'Backspace' && !value[i] && i > 0) { onChange(value.slice(0, i - 1) + value.slice(i)); refs.current[i - 1]?.focus(); e.preventDefault(); }
               }} />
      ))}
    </div>
  );
}
```

```tsx
// components/AuthForm.tsx — remplacer le bloc <label>Code secret…</label> par :
      <label className="pin-label">Code secret</label>
      <PinInput label="Code secret" value={code} onChange={setCode}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
```
(Attention : le `<label htmlFor>` devient un simple texte + PinInput a son propre aria-label — `getByLabel('Code secret')` pointera l'input 1. Retirer l'attribut `required` du code, la validation serveur suffit ; désactiver le bouton si `code.length !== 4` côté client pour l'ergonomie.)

```css
/* app/globals.css — ajouter (tokens existants) */
.pin { display: flex; gap: 9px; }
.pin input { width: 52px; height: 60px; text-align: center; font-size: 24px; font-weight: 600;
  font-family: var(--font-ui); color: var(--creme); background: var(--noyer);
  border: 1.5px solid var(--doux); border-radius: 10px; }
.pin input:focus { outline: none; border-color: var(--cuivre); }
.pin-label { font-size: 12px; color: var(--doux-clair); margin: 2px 0 7px; display: block; }
```

- [ ] **Step 2: Suite E2E complète au vert** — tuer le dev server (`pkill -f "next dev"`), puis `npm run test:e2e` → **toutes** les specs PASS (parcours, tirage, biblio, ajout, nights, etagere).
- [ ] **Step 3: Commit** — `git commit -am "feat: saisie PIN 4 chiffres (connexion + inscription)"`

---

### Task 7: Page /profil + ProfileClient (picker, crop, code, suppression) + menu « Mon profil »

**Files:**
- Create: `app/profil/page.tsx`
- Create: `components/ProfileClient.tsx`
- Modify: `app/etagere/page.tsx` (passer `me`), `components/ShelfClient.tsx` (menu)
- Modify: `app/globals.css` (styles profil)

**Interfaces:**
- Consomme: GET/PATCH/DELETE `/api/me`, POST `/api/me/avatar`, POST `/api/me/code`, `ALLOWED_STICKERS`, `avatarSrc`.
- Page serveur: `const user = await getSessionUser(); if (!user) redirect('/login');` + `getProfileStats(user.id)` → props `me: { pseudo, sticker, avatar_path }`, `stats`.

- [ ] **Step 1: Page serveur**

```tsx
// app/profil/page.tsx
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { getProfileStats } from '@/lib/users';
import ProfileClient from '@/components/ProfileClient';

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return <main className="page profile-page">
    <ProfileClient me={{ pseudo: user.pseudo, sticker: user.sticker ?? null, avatar_path: user.avatar_path ?? null }}
                   stats={getProfileStats(user.id)} />
  </main>;
}
```

- [ ] **Step 2: ProfileClient** — structure fidèle à la maquette v3 :
  - Zone avatar : bouton rond 88px (`<img>` si `avatar_path`, sinon emoji `sticker ?? '🎲'`), badge « changer ».
  - Pseudo (non modifiable), grille stats 3 blocs (`plays` « parties jouées », `nights` « soirées », `games` « jeux »).
  - Actions : « Changer mon code » (sheet en 3 étapes : PIN actuel → nouveau → confirmation, POST `/api/me/code`, message vert puis fermeture) ; « Supprimer mon profil » (sheet d'avertissement : « Ton profil, tes N jeux et tes tirages quittent l'app. Les soirées des autres restent, sans toi. Irréversible. » + PIN + bouton rouge → DELETE `/api/me` → `router.push('/register')`).
  - Picker de sticker : overlay bas, grille des 32 `ALLOWED_STICKERS`, clic → PATCH `/api/me` `{ sticker }` → `router.refresh()` + fermeture.
  - Deux boutons photo : « 📷 Prendre une photo » (`<input type="file" accept="image/*" capture="environment">`) et « 🖼 Choisir dans la galerie » (`<input type="file" accept="image/*">`) → ouvre `CropView`.
  - `CropView` (dans le même fichier) : image affichée dans un cadre carré plein écran, carré de recadrage 250px centré (masque sombre autour), **glisser pour déplacer** (pointer events) + **slider zoom 1→3**, bouton « Recadrer ✓ » : dessin sur `<canvas width={256} height={256}>` → `canvas.toBlob('image/jpeg', 0.9)` → FormData → POST `/api/me/avatar` → `router.refresh()`.
  - Aperçu du pseudo identique : `aria-label` français sur tous les contrôles.

- [ ] **Step 3: Menu utilisateur (ShelfClient)** — `app/etagere/page.tsx` passe `me={{ pseudo: user.pseudo, sticker: user.sticker ?? null, avatar_path: user.avatar_path ?? null }}` ; le chip affiche l'avatar (img ronde 16px ou emoji) + initiale ; le menu gagne un lien « Mon profil » (`<a href="/profil">`) au-dessus de « Se déconnecter ».

- [ ] **Step 4: CSS** (fidèle à la maquette : `.avatar-zone`, `.avatar` 88px + badge cuivre « changer », `.stats` 3 colonnes gap 10, `.stat b` cuivre 24px, `.actions`/`.action`, `.picker`, `.crop`, réutiliser `.sheet`/`.overlay` existants si présents sinon les créer).

- [ ] **Step 5: E2E `tests/e2e/profil.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test('profil : sticker choisi visible dans les chips', async ({ page }) => {
  const pseudo = `prof-${Date.now()}`;
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const reg = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await reg;
  // Soirée créée automatiquement au premier passage (pré-coché) → valider NightPicker si présent
  const start = page.getByRole('button', { name: /Lancer la soirée|C'est parti|Valider/ });
  if (await start.count()) await start.first().click();
  await page.goto('/profil');
  await page.getByRole('button', { name: /changer/i }).click();
  await page.getByRole('button', { name: '🦊' }).click();
  await expect(page.locator('.avatar')).toContainText('🦊');
  // chips de l'étagère
  await page.goto('/etagere');
  await expect(page.locator('.chip', { hasText: pseudo })).toContainText('🦊');
});
```
(Ajuster le sélecteur NightPicker à la réalité du code — vérifier le texte exact du bouton de création de soirée dans `NightPicker.tsx`.)

- [ ] **Step 6: PASS + commit** — `npm run test:e2e` → PASS ; `git commit -am "feat: page profil (sticker, photo, stats, code, suppression)"`

---

### Task 8: Avatar partout (chips, NightPicker, historique)

**Files:**
- Modify: `lib/nights.ts:24-28` (getNightPlayers), `app/api/users/route.ts`, `app/nights/page.tsx` (requêtes joueurs), `app/etagere/page.tsx:13` (users)
- Modify: `components/ShelfClient.tsx:64`, `components/NightPicker.tsx:48`, `app/nights/page.tsx` (chips), `components/ShelfClient.tsx` (user-chip → déjà fait Task 7)
- Create: `components/PlayerChip.tsx` (petit helper)

**Interfaces:**
- Consomme: `avatarSrc` (Task 4), `UserLite.sticker/avatar_path` (Task 1).
- Produces: `<PlayerChip u={UserLite} />` → `<span class="chip">[img ronde 16px | emoji] {pseudo}</span>`.

- [ ] **Step 1: Requêtes** — partout où `SELECT id, pseudo FROM users` alimente des chips ou le picker : ajouter `u.sticker, u.avatar_path` (etagere/page, api/users, nights/page via `getNightPlayers`, et toute requête joueurs de `nights/page.tsx` — la repérer par grep `night_players`).
- [ ] **Step 2: PlayerChip + remplacements** — remplacer les 3 occurrences littérales `🎲 {p.pseudo}` par `<PlayerChip u={p} />` (ShelfClient chips, NightPicker liste, nights/page historique). L'onglet « 🎲 Soirées » de TabBar reste un pictogramme : inchangé.
- [ ] **Step 3: Vérif visuelle + E2E** — `npm run test:e2e` → PASS (les specs existantes vérifient les pseudos, pas les emojis) ; vérif manuelle rapide sur `/etagere` puis `/nights`.
- [ ] **Step 4: Commit** — `git commit -am "feat: stickers/avatars dans les chips de joueurs"`

---

### Task 9: Longue pression 400 ms sur l'étagère

**Files:**
- Modify: `components/ShelfClient.tsx`
- Modify: `app/globals.css` (`.pick-banner`)
- Test: `tests/e2e/etagere-selection.spec.ts`

**Interfaces:**
- Consomme: `toggle(id)` existant, `selected` (Set), CTA existante.
- Produces: état `pickMode: boolean` ; bandeau `<div className="pick-banner" role="status">` « Sélection — touche les boîtes » + bouton « Terminé ». Long press 400 ms → `pickMode` + `toggle(g.id)` + vibration. Click en mode → toggle ; click hors mode → fiche. Le click qui suit un long press est ignoré.

- [ ] **Step 1: E2E qui échoue**

```ts
// tests/e2e/etagere-selection.spec.ts
import { test, expect } from '@playwright/test';

async function register(page: import('@playwright/test').Page, pseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const reg = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await reg;
  const start = page.getByRole('button', { name: /Lancer la soirée|C'est parti|Valider/ });
  if (await start.count()) await start.first().click();
}

test('longue pression → mode sélection, taps = toggle, Terminé sort', async ({ page }) => {
  const pseudo = `lp-${Date.now()}`;
  await register(page, pseudo);
  // 3 jeux via l'API (la session navigateur partage les cookies)
  for (const [t, f] of [['Alpha','grand'],['Bravo','moyen'],['Charlie','petit']] as const) {
    const form = new FormData();
    form.set('title', t); form.set('box_format', f);
    const res = await page.request.post('/api/games', { form });
    if (!res.ok()) throw new Error(`ajout jeu ${t}: ${res.status()} ${await res.text()}`);
  }
  await page.goto('/etagere');
  const box = page.locator('.box').first();
  await box.scrollIntoViewIfNeeded();
  const bb = await box.boundingBox();
  await page.mouse.move(bb!.x + bb!.width / 2, bb!.y + bb!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500); // > 400 ms
  await page.mouse.up();
  await expect(page.locator('.pick-banner')).toBeVisible();
  await expect(page.locator('.chip.selcount')).toContainText('1');
  await page.locator('.box').nth(1).click();
  await expect(page.locator('.chip.selcount')).toContainText('2');
  await page.locator('.box').nth(1).click();
  await expect(page.locator('.chip.selcount')).toContainText('1');
  // le click hors mode ouvre la fiche (comportement inchangé)
  await page.getByRole('button', { name: 'Terminé' }).click();
  await expect(page.locator('.pick-banner')).toHaveCount(0);
  await page.locator('.box').first().click();
  await expect(page.locator('.bottom-sheet')).toBeVisible();
});
```

- [ ] **Step 2: Vérifier l'échec** — `npx playwright test tests/e2e/etagere-selection.spec.ts` → FAIL (pas de `.pick-banner`).

- [ ] **Step 3: Implémenter dans ShelfClient**

```tsx
// états + refs (avec les autres useState)
  const [pickMode, setPickMode] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);
  const pressStart = useRef<{ x: number; y: number } | null>(null);

  function startPress(g: Game, e: React.PointerEvent) {
    if (pickMode) return;
    pressStart.current = { x: e.clientX, y: e.clientY };
    pressTimer.current = setTimeout(() => {
      suppressClick.current = true;
      setPickMode(true);
      toggle(g.id);
      navigator.vibrate?.(15);
    }, 400);
  }
  function cancelPress(e?: React.PointerEvent) {
    if (e && pressStart.current) {
      const dx = e.clientX - pressStart.current.x, dy = e.clientY - pressStart.current.y;
      if (Math.hypot(dx, dy) > 10) { pressStart.current = null; if (pressTimer.current) clearTimeout(pressTimer.current); return; }
    }
    if (pressTimer.current) clearTimeout(pressTimer.current);
  }
  function boxClick(g: Game) {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (pickMode) toggle(g.id); else setDetail(g);
  }
```

```tsx
// bouton boîte — remplacer onClick={() => setDetail(g)} :
              <button key={g.id} role="listitem" /* className/style inchangés */
                      onPointerDown={(e) => startPress(g, e)}
                      onPointerUp={() => cancelPress()}
                      onPointerLeave={() => cancelPress()}
                      onPointerMove={(e) => cancelPress(e)}
                      onPointerCancel={() => cancelPress()}
                      onContextMenu={(e) => e.preventDefault()}
                      onClick={() => boxClick(g)}>
```

```tsx
// bandeau — à rendre juste avant <div className="cta-zone"> :
      {pickMode && (
        <div className="pick-banner" role="status">
          <span>Sélection — touche les boîtes</span>
          <button type="button" onClick={() => setPickMode(false)}>Terminé</button>
        </div>
      )}
```

```css
/* app/globals.css */
.pick-banner { position: sticky; top: 8px; z-index: 40; display: flex; justify-content: space-between;
  align-items: center; gap: 10px; background: var(--cuivre); color: #fff; border-radius: 12px;
  padding: 10px 14px; font-size: 13.5px; font-weight: 600; }
.pick-banner button { background: #fff; color: var(--cuivre); border: none; border-radius: 999px;
  padding: 5px 13px; font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
```

- [ ] **Step 4: PASS** — E2E nouveau + **toute la suite** : `npm run test:e2e` → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat: sélection par longue pression (400 ms) sur l'étagère"`

---

### Task 10: Version 1.2.0, CHANGELOG, revue, PR

**Files:**
- Modify: `package.json` (`"version": "1.2.0"`)
- Modify: `CHANGELOG.md` (entrée `## [1.2.0] — 2026-10-XX`)

- [ ] **Step 1:** Bump version + CHANGELOG (sections `### Ajouté` : page profil complète, sticker/photo, long press, PIN 4 chiffres ; `### Modifié` : menu utilisateur avec « Mon profil »).
- [ ] **Step 2:** Vérifications finales : `npx tsc --noEmit && npm test` (29+ unitaires) et `npm run test:e2e` (10+ specs) → tout vert ; `npm run build` local si doute.
- [ ] **Step 3:** Pousser la branche `feat/profil-selection` + ouvrir la PR ; surveiller la CI (3 jobs) ; fusionner si verte ; tag `v1.2.0` après déploiement.

## Self-Review

- **Spec coverage:** sticker ✓ (T1/T7), photo+crop ✓ (T4/T7), pseudo ✓ (T7 affichage), stats ✓ (T1/T7), changement code PIN ✓ (T2/T6/T7), suppression double verrou ✓ (T3/T5/T7), PIN partout ✓ (T2/T6), long press 400 ms ✓ (T9), accès via menu ✓ (T7), avatar dans chips ✓ (T8), marges maquette ✓ (T7 CSS).
- **Placeholders:** les textes de boutons NightPicker (« Lancer la soirée ») sont à ajuster au code réel — indiqué dans la tâche, pas un TBD : l'exécuteur lit le fichier.
- **Type consistency:** `setSticker`/`setAvatar`/`changeCode`/`deleteAccount`/`getProfileStats` — signatures identiques entre tasks ; `avatarSrc` défini T4, consommé T7/T8.
- **Review Focus:** 1→T3, 2→T2, 3→T9, 4→T6, 5→T4 — chacun a son test.
