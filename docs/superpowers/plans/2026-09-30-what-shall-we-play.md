# What Shall We Play? — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PWA mobile-first « L'Étagère » : bibliothèques par joueur enrichies BGG, soirée = joueurs présents, sélection des boîtes sur une étagère scrollable, tirage au sort côté serveur avec roue animée et verdict plein écran.

**Architecture:** Next.js App Router (TypeScript) — pages serveur pour les données, composants clients pour l'interactif (étagère, roue, sheets). SQLite via `better-sqlite3` derrière un unique `lib/db.ts`. Modules purs testables : `lib/auth`, `lib/games`, `lib/bgg`, `lib/nights`, `lib/draw`, `lib/wheel`. API routes minces (`app/api/*`). Tests unitaires Vitest + E2E Playwright.

**Tech Stack:** Next.js 15, React 19, TypeScript strict, better-sqlite3, bcryptjs, fast-xml-parser, Vitest, Playwright, Docker (node:20-alpine, output standalone).

**Spec:** `docs/superpowers/specs/2026-09-30-what-shall-we-play-design.md`

## Global Constraints

- Interface **en français**, voix directe (« Sortir la boîte », pas « Valider »).
- Palette : noyer `#2A1F17` (fond), `#3A2B1F` (surface), crème `#F3E9DC` (texte), cuivre `#C96F3B` (action), vert `#3E9B6E` (validation), doux `#8A7660`/`#B9A58C`.
- Fonts : **Bricolage Grotesque** (display) + **Space Grotesk** (UI), via `next/font/google`.
- Formats de boîte : enum `'mini'|'petit'|'moyen'|'grand'`, échelle relative `{ grand:1, moyen:0.78, petit:0.62, mini:0.45 }` — obligatoire sur chaque jeu.
- Mots de passe (« code secret ») : bcrypt, **cost 10**, minimum **4 caractères** ; pseudo 3-20 caractères `[A-Za-z0-9_-]`.
- Cookie de session `wsp_session` : httpOnly, sameSite=lax, 30 jours.
- Uploads pochettes : jpg/jpeg/png/webp, **≤ 5 Mo**.
- BGG : requêtes côté serveur uniquement, **max ~1 req/s**, cache **30 jours** (`bgg_cache`), pochettes copiées localement. `Authorization: Bearer $BGG_TOKEN` si la variable existe.
- Le **tirage est un RNG cryptographique côté serveur** (`node:crypto`), enregistré dans `picks` avant l'affichage ; la roue est cosmétique.
- SQLite fichier dans `DATA_DIR` (défaut `./data`), WAL, `foreign_keys = ON`.
- Port **3000**. Pas de framework UI lourd (pas de Tailwind, pas de MUI).
- `picks.game_id` en `ON DELETE RESTRICT` : un jeu déjà tiré ne peut pas être supprimé (réponse 409).

## Review Focus

Entrées/failures que les tests de tâches ne couvrent pas naturellement — chacune est épinglée par un test dans la tâche indiquée :

1. **Jeu sans pochette** (ni BGG ni upload) → l'étagère affiche un placeholder ♟, jamais une image cassée. → test E2E, Task 14.
2. **Suppression d'un jeu déjà tiré** → 409 + message « Ce jeu a déjà été tiré lors d'une soirée », l'historique reste intact. → test unitaire, Task 4.
3. **Pseudo en doublon à la casse près** (« Marc » vs « marc ») → 409 « Pseudo déjà pris » grâce à `COLLATE NOCASE`. → test unitaire, Task 3.
4. **Session expirée** (30 j dépassés) → `getUserByToken` renvoie null ; API → 401, page → redirect `/login`. → test unitaire, Task 3.
5. **BGG injoignable** (timeout/DNS) → 502 JSON `{ error: "Recherche BGG indisponible, saisie manuelle toujours possible" }`, le formulaire reste utilisable. → test unitaire (fetch mocké), Task 5.
6. **Sélection vide au clic « Lancer le tirage »** → CTA désactivé, aucun appel réseau. → test unitaire Wheel/ShelfClient (Task 10) + E2E, Task 14.

---

### Task 1: Scaffolding Next.js + outillage de tests

**Files:**
- Create: projet Next.js à la racine du repo (`package.json`, `next.config.mjs`, `tsconfig.json`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`)
- Create: `vitest.config.ts`, `vitest.setup.ts`
- Create: `playwright.config.ts`
- Modify: `package.json` (scripts, deps)

**Interfaces:**
- Produces: scripts npm `dev`/`build`/`start`/`test`/`test:e2e` ; `DATA_DIR` lu par tous les modules ; vitest opérationnel (`npm test`), Playwright opérationnel (`npm run test:e2e`).

- [ ] **Step 1: Scaffold Next.js (sans Tailwind, sans src dir)**

```bash
cd /Users/marcsuarez/Documents/what-shall-we-play
npx create-next-app@15 . --ts --app --eslint --no-tailwind --no-src-dir --import-alias "@/*" --use-npm --skip-install
npm install
npm install better-sqlite3 bcryptjs fast-xml-parser
npm install -D vitest @types/better-sqlite3 @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Config Next (SQLite externe + standalone)** — `next.config.mjs`

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],
};
export default nextConfig;
```

- [ ] **Step 3: Vitest** — `vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'node', setupFiles: ['./vitest.setup.ts'] },
});
```

`vitest.setup.ts`

```ts
import fs from 'node:fs';
import path from 'node:path';
const dir = path.resolve('.tmp-vitest');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
process.env.DATA_DIR = dir;
```

- [ ] **Step 4: Playwright** — `playwright.config.ts`

```ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://localhost:3000' },
  webServer: { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 120_000 },
});
```

- [ ] **Step 5: Premier test unitaire (fumée) qui échoue** — `tests/unit/smoke.test.ts`

```ts
import { describe, it, expect } from 'vitest';
describe('outillage', () => {
  it('vitest tourne et DATA_DIR est isolé', () => {
    expect(process.env.DATA_DIR).toContain('.tmp-vitest');
  });
});
```

- [ ] **Step 6: Vérifier**

Run: `npm test`
Expected: PASS (1 test)

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js + vitest + playwright"
```

---

### Task 2: Couche DB et schéma SQLite

**Files:**
- Create: `lib/db.ts`
- Create: `lib/types.ts`
- Test: `tests/unit/db.test.ts`

**Interfaces:**
- Produces: `getDb(): Database.Database` (singleton), `DB_PATH: string`, `DATA_DIR: string` ; types `Game`, `Night`, `UserLite`, `Pick`, `BoxFormat`.

- [ ] **Step 1: Types partagés** — `lib/types.ts`

```ts
export type BoxFormat = 'mini' | 'petit' | 'moyen' | 'grand';

export interface UserRow { id: number; pseudo: string; code_hash: string; created_at: string; }
export interface UserLite { id: number; pseudo: string; }
export interface Game {
  id: number; owner_id: number; bgg_id: number | null; title: string;
  year: number | null; publisher: string | null; cover_url: string | null; cover_path: string | null;
  min_players: number | null; max_players: number | null; playtime_min: number | null;
  weight: number | null; bgg_rating: number | null; box_format: BoxFormat; created_at: string;
}
export interface Night { id: number; creator_id: number; played_at: string; created_at: string; }
export interface Pick { id: number; night_id: number; game_id: number; spinner_id: number; created_at: string; }
```

- [ ] **Step 2: Test qui échoue** — `tests/unit/db.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { getDb } from '@/lib/db';

describe('db', () => {
  it('crée toutes les tables du schéma', () => {
    const db = getDb();
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all()
      .map((r: { name: string }) => r.name);
    for (const t of ['users','sessions','games','nights','night_players','picks','bgg_cache'])
      expect(tables).toContain(t);
  });
  it('active les clés étrangères et le mode WAL', () => {
    const db = getDb();
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
  });
});
```

- [ ] **Step 3: Run** — `npm test` → Expected: FAIL (« Cannot find module '@/lib/db' »)

- [ ] **Step 4: Implémentation** — `lib/db.ts`

```ts
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
export const DB_PATH = path.join(DATA_DIR, 'app.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pseudo TEXT NOT NULL COLLATE NOCASE UNIQUE,
  code_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bgg_id INTEGER, title TEXT NOT NULL, year INTEGER, publisher TEXT,
  cover_url TEXT, cover_path TEXT,
  min_players INTEGER, max_players INTEGER, playtime_min INTEGER,
  weight REAL, bgg_rating REAL,
  box_format TEXT NOT NULL CHECK (box_format IN ('mini','petit','moyen','grand')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS nights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_id INTEGER NOT NULL REFERENCES users(id),
  played_at TEXT NOT NULL DEFAULT (date('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS night_players (
  night_id INTEGER NOT NULL REFERENCES nights(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(night_id, user_id)
);
CREATE TABLE IF NOT EXISTS picks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  night_id INTEGER NOT NULL REFERENCES nights(id) ON DELETE CASCADE,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE RESTRICT,
  spinner_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS bgg_cache (
  bgg_id INTEGER PRIMARY KEY,
  payload_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
`;

let db: Database.Database | null = null;
export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}
```

- [ ] **Step 5: Run** — `npm test` → Expected: PASS

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: schema sqlite + couche db"`

---

### Task 3: Authentification (lib + routes + pages)

**Files:**
- Create: `lib/auth.ts`, `lib/session.ts`, `app/api/auth/register/route.ts`, `app/api/auth/login/route.ts`, `app/api/auth/logout/route.ts`
- Create: `app/login/page.tsx`, `app/register/page.tsx`, `components/AuthForm.tsx`
- Modify: `app/page.tsx` (redirect selon session)
- Test: `tests/unit/auth.test.ts`

**Interfaces:**
- Produces: `registerUser(pseudo: string, code: string): { id: number } | { error: string; status: number }` ; `verifyLogin(idem)` ; `createSession(userId: number): string` ; `getUserByToken(token: string): UserRow | null` ; `getSessionUser(): UserRow | null` (cookies next/headers) ; `COOKIE_NAME = 'wsp_session'` ; `cookieOpts()`.

- [ ] **Step 1: Tests qui échouent** — `tests/unit/auth.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { registerUser, verifyLogin, createSession, getUserByToken } from '@/lib/auth';
import { getDb } from '@/lib/db';

describe('auth', () => {
  it('refuse un pseudo trop court / code trop court', () => {
    expect(registerUser('ab', '1234').status).toBe(400);
    expect(registerUser('marc', 'abc').status).toBe(400);
  });
  it('inscrit puis connecte', () => {
    const r = registerUser('marc', '1234');
    expect('id' in r && r.id > 0).toBe(true);
    expect(verifyLogin('marc', '1234')).toHaveProperty('id');
    expect(verifyLogin('marc', '0000')).toEqual({ error: 'Identifiants incorrects', status: 401 });
  });
  it('refuse le doublon à la casse près', () => {
    registerUser('lea', '1234');
    const r = registerUser('LEA', '5678');
    expect(r).toEqual({ error: 'Pseudo déjà pris', status: 409 });
  });
  it('session : crée, lit, expire', () => {
    const id = (registerUser('thibault', '1234') as { id: number }).id;
    const token = createSession(id);
    expect(getUserByToken(token)?.pseudo).toBe('thibault');
    const db = getDb();
    db.prepare(`UPDATE sessions SET expires_at = datetime('now','-1 day')`).run();
    expect(getUserByToken(token)).toBeNull();
  });
});
```

- [ ] **Step 2: Run** — `npm test` → FAIL (module introuvable)

- [ ] **Step 3: `lib/auth.ts`**

```ts
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { getDb } from './db';
import type { UserRow } from './types';

export type AuthResult = { id: number } | { error: string; status: number };

export function validatePseudo(p: unknown): string | null {
  if (typeof p !== 'string' || !/^[A-Za-z0-9_-]{3,20}$/.test(p)) return 'Pseudo : 3 à 20 caractères (lettres, chiffres, _ -)';
  return null;
}
export function validateCode(c: unknown): string | null {
  if (typeof c !== 'string' || c.length < 4) return 'Code secret : 4 caractères minimum';
  return null;
}

export function registerUser(pseudo: unknown, code: unknown): AuthResult {
  const pe = validatePseudo(pseudo); if (pe) return { error: pe, status: 400 };
  const ce = validateCode(code); if (ce) return { error: ce, status: 400 };
  const hash = bcrypt.hashSync(code as string, 10);
  try {
    const info = getDb().prepare('INSERT INTO users (pseudo, code_hash) VALUES (?, ?)').run(pseudo, hash);
    return { id: Number(info.lastInsertRowid) };
  } catch (e: unknown) {
    if (String(e).includes('UNIQUE')) return { error: 'Pseudo déjà pris', status: 409 };
    throw e;
  }
}

export function verifyLogin(pseudo: unknown, code: unknown): AuthResult {
  const row = getDb().prepare('SELECT * FROM users WHERE pseudo = ?').get(pseudo) as UserRow | undefined;
  if (!row || !bcrypt.compareSync(String(code ?? ''), row.code_hash))
    return { error: 'Identifiants incorrects', status: 401 };
  return { id: row.id };
}

export function createSession(userId: number): string {
  const token = crypto.randomBytes(32).toString('hex');
  getDb().prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now','+30 days'))`).run(token, userId);
  return token;
}

export function getUserByToken(token: string): UserRow | null {
  const row = getDb().prepare(`
    SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now')`).get(token) as UserRow | undefined;
  return row ?? null;
}
```

- [ ] **Step 4: `lib/session.ts`**

```ts
import { cookies } from 'next/headers';
import { getUserByToken } from './auth';
import type { UserRow } from './types';

export const COOKIE_NAME = 'wsp_session';
export function cookieOpts() {
  return { httpOnly: true, sameSite: 'lax' as const, maxAge: 60 * 60 * 24 * 30, path: '/' };
}
export function getSessionUser(): UserRow | null {
  const token = cookies().get(COOKIE_NAME)?.value;
  return token ? getUserByToken(token) : null;
}
```

- [ ] **Step 5: Routes** — `app/api/auth/register/route.ts`, `login/route.ts`, `logout/route.ts`

```ts
// register
import { NextResponse } from 'next/server';
import { registerUser, createSession } from '@/lib/auth';
import { COOKIE_NAME, cookieOpts } from '@/lib/session';

export async function POST(req: Request) {
  const { pseudo, code } = await req.json();
  const res = registerUser(pseudo, code);
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, createSession(res.id), cookieOpts());
  return response;
}
```

```ts
// login (même forme, verifyLogin en lieu et place de registerUser)
```

```ts
// logout
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/session';
import { getDb } from '@/lib/db';

export async function POST() {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (token) getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token);
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(COOKIE_NAME);
  return response;
}
```

- [ ] **Step 6: Pages** — `components/AuthForm.tsx` (client, partagé), `app/login/page.tsx`, `app/register/page.tsx`, `app/page.tsx` (redirect)

```tsx
// components/AuthForm.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const [pseudo, setPseudo] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    const res = await fetch(`/api/auth/${mode}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pseudo, code }),
    });
    setBusy(false);
    if (!res.ok) { setError((await res.json()).error); return; }
    router.push('/etagere'); router.refresh();
  }

  return (
    <form onSubmit={submit} className="auth-form">
      <h1>{mode === 'login' ? 'Bonsoir !' : 'Créer un compte'}</h1>
      <label>Pseudo
        <input value={pseudo} onChange={(e) => setPseudo(e.target.value)} autoComplete="username" required />
      </label>
      <label>Code secret
        <input type="password" value={code} onChange={(e) => setCode(e.target.value)}
               autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button disabled={busy}>{mode === 'login' ? 'Entrer' : 'Créer mon compte'}</button>
      <a href={mode === 'login' ? '/register' : '/login'}>
        {mode === 'login' ? 'Pas de compte ? Le créer' : 'Déjà un compte ? Entrer'}
      </a>
    </form>
  );
}
```

```tsx
// app/page.tsx
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
export default function Home() { redirect(getSessionUser() ? '/etagere' : '/login'); }
```

Pages login/register : `<main className="auth-page"><AuthForm mode="login|register" /></main>`.

- [ ] **Step 7: Vérification manuelle API**

```bash
npm run dev &
curl -s -X POST localhost:3000/api/auth/register -H 'Content-Type: application/json' -d '{"pseudo":"marc","code":"1234"}' -c /tmp/wsp.jar
curl -s -X POST localhost:3000/api/auth/register -H 'Content-Type: application/json' -d '{"pseudo":"marc","code":"5678"}'
```
Expected: `{"ok":true}` puis `{"error":"Pseudo déjà pris"}` avec HTTP 409.

- [ ] **Step 8: Run tests** — `npm test` → PASS. **Commit** — `git add -A && git commit -m "feat: auth pseudo + code secret (bcrypt, sessions)"`

---

### Task 4: Jeux — validation, API CRUD, stockage pochettes

**Files:**
- Create: `lib/games.ts`, `lib/storage.ts`, `app/api/games/route.ts`, `app/api/games/[id]/route.ts`, `app/api/cover/[name]/route.ts`
- Test: `tests/unit/games.test.ts`

**Interfaces:**
- Produces: `validateGameInput(body: unknown): { ok: true; value: NewGame } | { ok: false; error: string }` ; `NewGame` ; `createGame(ownerId: number, g: NewGame, coverPath?: string | null): number` ; `deleteGame(ownerId: number, id: number): { ok: true } | { error: string; status: number }` ; `listMyGames(ownerId: number): Game[]` ; `saveCover(buf: Buffer, ext: 'jpg'|'jpeg'|'png'|'webp'): string` (retourne le nom de fichier) ; `isSafeCoverName(name: string): boolean`. POST `/api/games` accepte aussi le champ `cover_name` : nom de fichier de pochette déjà téléchargée côté serveur par `getThing` (Task 5).

- [ ] **Step 1: Tests qui échouent** — `tests/unit/games.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { validateGameInput, createGame, deleteGame, listMyGames } from '@/lib/games';
import { registerUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

describe('games', () => {
  it('valide le format de boîte et le titre', () => {
    expect(validateGameInput({ title: 'Dune', box_format: 'énorme' }).ok).toBe(false);
    expect(validateGameInput({ title: '', box_format: 'grand' }).ok).toBe(false);
    const v = validateGameInput({ title: 'Dune', box_format: 'grand' });
    expect(v.ok && v.value.title).toBe('Dune');
  });
  it('refuse la suppression d\'un jeu déjà tiré (409)', () => {
    const uid = (registerUser('g1', '1234') as { id: number }).id;
    const v = validateGameInput({ title: 'Rebirth', box_format: 'moyen' });
    if (!v.ok) throw new Error('input invalide');
    const gid = createGame(uid, v.value);
    const db = getDb();
    db.prepare(`INSERT INTO nights (creator_id) VALUES (?)`).run(uid);
    db.prepare(`INSERT INTO picks (night_id, game_id, spinner_id) VALUES (1, ?, ?)`).run(gid, uid);
    const res = deleteGame(uid, gid);
    expect(res).toEqual({ error: 'Ce jeu a déjà été tiré lors d\'une soirée', status: 409 });
    expect(listMyGames(uid)).toHaveLength(1);
  });
  it('supprime un jeu jamais tiré', () => {
    const uid = (registerUser('g2', '1234') as { id: number }).id;
    const gid = createGame(uid, { title: 'Deus', box_format: 'grand' });
    expect(deleteGame(uid, gid)).toEqual({ ok: true });
    expect(listMyGames(uid)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run** — `npm test` → FAIL

- [ ] **Step 3: `lib/storage.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from './db';

const COVERS_DIR = path.join(DATA_DIR, 'covers');
export const COVER_EXT = ['jpg', 'jpeg', 'png', 'webp'] as const;
export type CoverExt = (typeof COVER_EXT)[number];

export function isSafeCoverName(name: string): boolean {
  return /^[a-z0-9-]+\.(jpg|jpeg|png|webp)$/.test(name);
}
export function saveCover(buf: Buffer, ext: CoverExt): string {
  fs.mkdirSync(COVERS_DIR, { recursive: true });
  const name = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(COVERS_DIR, name), buf);
  return name;
}
export function coverPathOnDisk(name: string): string {
  return path.join(COVERS_DIR, path.basename(name));
}
```

- [ ] **Step 4: `lib/games.ts`**

```ts
import { getDb } from './db';
import type { Game, BoxFormat } from './types';

const FORMATS: BoxFormat[] = ['mini', 'petit', 'moyen', 'grand'];
export interface NewGame {
  title: string; box_format: BoxFormat; bgg_id?: number | null; year?: number | null;
  publisher?: string | null; min_players?: number | null; max_players?: number | null;
  playtime_min?: number | null; weight?: number | null; bgg_rating?: number | null;
}
export function validateGameInput(body: unknown): { ok: true; value: NewGame } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.title !== 'string' || b.title.trim().length < 1 || b.title.length > 120)
    return { ok: false, error: 'Titre requis (120 caractères max)' };
  if (!FORMATS.includes(b.box_format as BoxFormat))
    return { ok: false, error: 'Choisissez un format de boîte' };
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    ok: true,
    value: {
      title: b.title.trim(), box_format: b.box_format as BoxFormat,
      bgg_id: num(b.bgg_id), year: num(b.year), publisher: typeof b.publisher === 'string' ? b.publisher.slice(0, 120) : null,
      min_players: num(b.min_players), max_players: num(b.max_players),
      playtime_min: num(b.playtime_min), weight: num(b.weight), bgg_rating: num(b.bgg_rating),
    },
  };
}

export function createGame(ownerId: number, g: NewGame, coverPath: string | null = null): number {
  const info = getDb().prepare(`
    INSERT INTO games (owner_id, title, box_format, bgg_id, year, publisher, min_players, max_players, playtime_min, weight, bgg_rating, cover_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    ownerId, g.title, g.box_format, g.bgg_id ?? null, g.year ?? null, g.publisher ?? null,
    g.min_players ?? null, g.max_players ?? null, g.playtime_min ?? null,
    g.weight ?? null, g.bgg_rating ?? null, coverPath);
  return Number(info.lastInsertRowid);
}

export function listMyGames(ownerId: number): Game[] {
  return getDb().prepare('SELECT * FROM games WHERE owner_id = ? ORDER BY box_format, title').all(ownerId) as Game[];
}

export function getGame(id: number): Game | null {
  return (getDb().prepare('SELECT * FROM games WHERE id = ?').get(id) as Game | undefined) ?? null;
}

export function deleteGame(ownerId: number, id: number): { ok: true } | { error: string; status: number } {
  const g = getGame(id);
  if (!g || g.owner_id !== ownerId) return { error: 'Jeu introuvable', status: 404 };
  const picked = getDb().prepare('SELECT 1 FROM picks WHERE game_id = ? LIMIT 1').get(id);
  if (picked) return { error: 'Ce jeu a déjà été tiré lors d\'une soirée', status: 409 };
  getDb().prepare('DELETE FROM games WHERE id = ?').run(id);
  return { ok: true };
}
```

- [ ] **Step 5: Routes** — `app/api/games/route.ts` (POST FormData, GET mes jeux), `app/api/games/[id]/route.ts` (PATCH/DELETE), `app/api/cover/[name]/route.ts`

```ts
// app/api/games/route.ts
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { validateGameInput, createGame, listMyGames } from '@/lib/games';
import { saveCover, isSafeCoverName, COVER_EXT } from '@/lib/storage';

export async function GET() {
  const user = getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  return NextResponse.json({ games: listMyGames(user.id) });
}

export async function POST(req: Request) {
  const user = getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const form = await req.formData();
  const raw: Record<string, unknown> = {};
  for (const k of ['title', 'box_format', 'bgg_id', 'year', 'publisher', 'min_players', 'max_players', 'playtime_min', 'weight', 'bgg_rating']) {
    const v = form.get(k);
    if (v !== null) raw[k] = Number.isNaN(Number(v)) || v === '' ? v : Number(v);
  }
  const v = validateGameInput(raw);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  let coverPath: string | null = null;
  const coverName = form.get('cover_name'); // pochette déjà rapatriée depuis BGG (Task 5)
  if (typeof coverName === 'string' && isSafeCoverName(coverName)) coverPath = coverName;
  const file = form.get('cover');
  if (file && file instanceof File && file.size > 0) {
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'Pochette : 5 Mo maximum' }, { status: 400 });
    const ext = file.name.split('.').pop()?.toLowerCase() as (typeof COVER_EXT)[number] | undefined;
    if (!ext || !COVER_EXT.includes(ext)) return NextResponse.json({ error: 'Pochette : jpg, png ou webp' }, { status: 400 });
    coverPath = saveCover(Buffer.from(await file.arrayBuffer()), ext);
  }
  const id = createGame(user.id, v.value, coverPath);
  return NextResponse.json({ id });
}
```

```ts
// app/api/games/[id]/route.ts — DELETE ; PATCH édite title/box_format/numériques (même validateGameInput, UPDATE)
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { deleteGame, getGame, validateGameInput } from '@/lib/games';
import { getDb } from '@/lib/db';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const res = deleteGame(user.id, Number((await params).id));
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const g = getGame(Number((await params).id));
  if (!g || g.owner_id !== user.id) return NextResponse.json({ error: 'Jeu introuvable' }, { status: 404 });
  const body = await req.json();
  const v = validateGameInput({ ...g, ...body });
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  getDb().prepare(`UPDATE games SET title=?, box_format=?, year=?, publisher=?, min_players=?, max_players=?, playtime_min=?, weight=?, bgg_rating=? WHERE id=?`)
    .run(v.value.title, v.value.box_format, v.value.year ?? null, v.value.publisher ?? null,
         v.value.min_players ?? null, v.value.max_players ?? null, v.value.playtime_min ?? null,
         v.value.weight ?? null, v.value.bgg_rating ?? null, g.id);
  return NextResponse.json({ ok: true });
}
```

```ts
// app/api/cover/[name]/route.ts
import fs from 'node:fs';
import { NextResponse } from 'next/server';
import { isSafeCoverName, coverPathOnDisk } from '@/lib/storage';

const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const name = (await params).name;
  if (!isSafeCoverName(name)) return new NextResponse('Not found', { status: 404 });
  const p = coverPathOnDisk(name);
  if (!fs.existsSync(p)) return new NextResponse('Not found', { status: 404 });
  const ext = name.split('.').pop() as string;
  return new NextResponse(fs.readFileSync(p), {
    headers: { 'Content-Type': MIME[ext], 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
}
```

- [ ] **Step 6: Run** — `npm test` → PASS. **Vérif manuelle** : curl POST FormData avec un jpg. **Commit** — `feat: jeux (API CRUD + pochettes locales)`

---

### Task 5: Intégration BGG (recherche, fiche, cache, image)

**Files:**
- Create: `lib/bgg.ts`, `app/api/bgg/search/route.ts`, `app/api/bgg/thing/route.ts`
- Create: `tests/unit/bgg.fixture.ts` (XML minimal), `tests/unit/bgg.test.ts`

**Interfaces:**
- Produces: `searchBoardgames(q: string): Promise<{ bggId: number; name: string }[]>` ; `getThing(bggId: number): Promise<ThingResult | null>` ; `parseThingXml(xml: string): ThingParsed | null` (pur) ; `ThingResult = ThingParsed & { coverName: string | null }` ; `ThingParsed = { bggId, title, year, publisher, minPlayers, maxPlayers, playtimeMin, weight, rating, imageUrl }` (tous `number|null|string|null` selon le champ).

- [ ] **Step 1: Fixture XML** — `tests/unit/bgg.fixture.ts`

```ts
export const THING_XML = `<?xml version="1.0" encoding="utf-8"?>
<items termsofuse="https://boardgamegeek.com/xmlapi/termsofuse">
  <item type="boardgame" id="167791">
    <thumbnail src="https://cf.geekdo-images.com/t.jpg"/>
    <image src="https://cf.geekdo-images.com/f.jpg"/>
    <name type="primary" sortindex="1" value="Terraforming Mars"/>
    <yearpublished value="2016"/>
    <minplayers value="1"/>
    <maxplayers value="5"/>
    <playingtime value="120"/>
    <link type="boardgamepublisher" id="18037" value="FryxGames"/>
    <statistics page="1">
      <ratings>
        <average value="8.355"/>
        <averageweight value="3.32"/>
      </ratings>
    </statistics>
  </item>
</items>`;
```

- [ ] **Step 2: Tests qui échouent** — `tests/unit/bgg.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest';
import { parseThingXml, getThing } from '@/lib/bgg';
import { THING_XML } from './bgg.fixture';

describe('bgg', () => {
  it('parse la fiche d\'un jeu', () => {
    const p = parseThingXml(THING_XML);
    expect(p).toMatchObject({
      bggId: 167791, title: 'Terraforming Mars', year: 2016, publisher: 'FryxGames',
      minPlayers: 1, maxPlayers: 5, playtimeMin: 120, weight: 3.32, rating: 8.36,
      imageUrl: 'https://cf.geekdo-images.com/f.jpg',
    });
  });
  it('renvoie null sur un XML vide', () => {
    expect(parseThingXml('<items total="0"></items>')).toBeNull();
  });
  it('met en cache 30 jours (2e appel sans réseau)', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(THING_XML, { status: 200 }));
    await getThing(167791);
    await getThing(167791);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
  it('timeout BGG -> null (et pas de crash)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    expect(await getThing(999999)).toBeNull();
  });
});
```

- [ ] **Step 3: Run** — `npm test` → FAIL

- [ ] **Step 4: `lib/bgg.ts`**

```ts
import { XMLParser } from 'fast-xml-parser';
import fs from 'node:fs';
import path from 'node:path';
import { getDb, DATA_DIR } from './db';
import { saveCover } from './storage';

const BASE = 'https://api.geekdo.com/xmlapi2';
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'User-Agent': 'what-shall-we-play (personnel)' };
  if (process.env.BGG_TOKEN) h['Authorization'] = `Bearer ${process.env.BGG_TOKEN}`;
  return h;
}

async function bggFetch(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; } // réseau HS/timeout -> null, l'app reste utilisable
}

export interface ThingParsed {
  bggId: number; title: string; year: number | null; publisher: string | null;
  minPlayers: number | null; maxPlayers: number | null; playtimeMin: number | null;
  weight: number | null; rating: number | null; imageUrl: string | null;
}
export interface ThingResult extends ThingParsed { coverName: string | null; }

const n = (v: unknown): number | null => {
  const x = Number(v); return Number.isFinite(x) ? Math.round(x * 100) / 100 : null;
};

export function parseThingXml(xml: string): ThingParsed | null {
  const root = parser.parse(xml)?.items;
  const item = Array.isArray(root?.item) ? root.item.find((i: Record<string, unknown>) => i['@_type'] === 'boardgame') : root?.item;
  if (!item) return null;
  const val = (path: string): string | undefined =>
    path.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], item)?.['@_value'];
  const name = item.name?.['@_value'] ?? (Array.isArray(item.name) ? item.name.find((x: Record<string, unknown>) => x['@_type'] === 'primary')?.['@_value'] : undefined);
  if (!name) return null;
  return {
    bggId: Number(item['@_id']), title: String(name), year: n(val('yearpublished')),
    publisher: (Array.isArray(item.link) ? item.link : item.link ? [item.link] : [])
      .find((l: Record<string, unknown>) => l['@_type'] === 'boardgamepublisher')?.['@_value'] ?? null,
    minPlayers: n(val('minplayers')), maxPlayers: n(val('maxplayers')), playtimeMin: n(val('playingtime')),
    weight: n(val('statistics.ratings.averageweight')), rating: n(val('statistics.ratings.average')),
    imageUrl: item.image?.['@_src'] ?? null,
  };
}

export async function searchBoardgames(q: string): Promise<{ bggId: number; name: string }[]> {
  const xml = await bggFetch(`${BASE}/search?query=${encodeURIComponent(q)}&type=boardgame`);
  if (!xml) throw new Error('BGG_UNAVAILABLE');
  const root = parser.parse(xml)?.items;
  const items = root?.item ? (Array.isArray(root.item) ? root.item : [root.item]) : [];
  return items.map((i: Record<string, unknown>) => ({ bggId: Number(i['@_id']), name: String(i.name?.['@_value'] ?? '') }));
}

export async function getThing(bggId: number): Promise<ThingResult | null> {
  const db = getDb();
  const cached = db.prepare('SELECT payload_json, fetched_at FROM bgg_cache WHERE bgg_id = ?').get(bggId) as
    { payload_json: string; fetched_at: string } | undefined;
  if (cached && db.prepare(`SELECT fetched_at >= datetime('now','-30 days') AS fresh FROM bgg_cache WHERE bgg_id = ?`)
        .get(bggId)?.fresh) {
    return JSON.parse(cached.payload_json) as ThingResult;
  }
  const xml = await bggFetch(`${BASE}/things?id=${bggId}&stats=1`);
  const parsed = xml ? parseThingXml(xml) : null;
  if (!parsed) return cached ? JSON.parse(cached.payload_json) : null;
  let coverName: string | null = null;
  if (parsed.imageUrl) {
    try {
      const img = await fetch(parsed.imageUrl, { signal: AbortSignal.timeout(8000) });
      if (img.ok) {
        const buf = Buffer.from(await img.arrayBuffer());
        coverName = saveCover(buf, 'jpg');
      }
    } catch { coverName = null; }
  }
  const result: ThingResult = { ...parsed, coverName };
  db.prepare(`INSERT INTO bgg_cache (bgg_id, payload_json, fetched_at) VALUES (?, ?, datetime('now'))
              ON CONFLICT(bgg_id) DO UPDATE SET payload_json = excluded.payload_json, fetched_at = excluded.fetched_at`)
    .run(bggId, JSON.stringify(result));
  return result;
}
```

- [ ] **Step 5: Route de recherche** — `app/api/bgg/search/route.ts`

```ts
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { searchBoardgames } from '@/lib/bgg';

export async function GET(req: Request) {
  const user = getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const q = new URL(req.url).searchParams.get('q')?.trim();
  if (!q || q.length < 2) return NextResponse.json({ results: [] });
  try {
    return NextResponse.json({ results: await searchBoardgames(q) });
  } catch {
    return NextResponse.json({ error: 'Recherche BGG indisponible, saisie manuelle toujours possible' }, { status: 502 });
  }
}
```

- [ ] **Step 6: Route fiche BGG** — `app/api/bgg/thing/route.ts` (préremplissage du formulaire, Task 6)

```ts
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getThing } from '@/lib/bgg';

export async function GET(req: Request) {
  const user = getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'id invalide' }, { status: 400 });
  const thing = await getThing(id);
  if (!thing) return NextResponse.json({ error: 'Fiche BGG indisponible' }, { status: 502 });
  return NextResponse.json(thing);
}
```

- [ ] **Step 7: Run** — `npm test` → PASS. **Commit** — `feat: intégration BGG (recherche, fiche, cache 30j, pochette locale)`

---

### Task 6: Pages « Ajouter un jeu » et « Ma bibliothèque »

**Files:**
- Create: `app/games/add/page.tsx`, `components/AddGameForm.tsx`, `app/library/page.tsx`, `components/LibraryClient.tsx`
- Create: `lib/formats.ts`, `lib/cover.ts`
- Test: `tests/unit/formats.test.ts`

**Interfaces:**
- Produces: `FORMATS: readonly BoxFormat[]` (ordre d'affichage `['grand','moyen','petit','mini']`), `FORMAT_SCALE: Record<BoxFormat, number>`, `FORMAT_LABEL: Record<BoxFormat, string>`, `coverSrc(g: { cover_path: string|null; cover_url: string|null }): string | null`.

- [ ] **Step 1: Test formats/cover** — `tests/unit/formats.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { FORMATS, FORMAT_SCALE, coverSrc } from '@/lib/formats';

describe('formats', () => {
  it('échelle décroissante grand -> mini', () => {
    expect(FORMATS).toEqual(['grand', 'moyen', 'petit', 'mini']);
    expect(FORMAT_SCALE.grand).toBe(1);
    expect(FORMAT_SCALE.mini).toBeLessThan(FORMAT_SCALE.petit);
  });
  it('coverSrc : fichier local prioritaire, sinon URL BGG, sinon null', () => {
    expect(coverSrc({ cover_path: 'a.jpg', cover_url: 'http://x' })).toBe('/api/cover/a.jpg');
    expect(coverSrc({ cover_path: null, cover_url: 'http://x' })).toBe('http://x');
    expect(coverSrc({ cover_path: null, cover_url: null })).toBeNull();
  });
});
```

- [ ] **Step 2: Run** — `npm test` → FAIL. Puis implémentez `lib/formats.ts` :

```ts
import type { BoxFormat, Game } from './types';
export const FORMATS = ['grand', 'moyen', 'petit', 'mini'] as const;
export const FORMAT_SCALE: Record<BoxFormat, number> = { grand: 1, moyen: 0.78, petit: 0.62, mini: 0.45 };
export const FORMAT_LABEL: Record<BoxFormat, string> = {
  grand: 'Grand · 30×30', moyen: 'Moyen', petit: 'Petit', mini: 'Mini-boîte',
};
export function coverSrc(g: Pick<Game, 'cover_path' | 'cover_url'>): string | null {
  if (g.cover_path) return `/api/cover/${g.cover_path}`;
  return g.cover_url;
}
```

- [ ] **Step 3: Run** — `npm test` → PASS

- [ ] **Step 4: `components/AddGameForm.tsx`** (client) — recherche BGG + formulaire + upload

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FORMATS, FORMAT_LABEL } from '@/lib/formats';

interface Suggestion { bggId: number; name: string; }
const FIELDS = [
  ['year', 'Année'], ['publisher', 'Éditeur'], ['min_players', 'Joueurs min'],
  ['max_players', 'Joueurs max'], ['playtime_min', 'Durée (min)'], ['weight', 'Poids (0-5)'],
] as const;

export default function AddGameForm() {
  const router = useRouter();
  const [q, setQ] = useState(''); const [results, setResults] = useState<Suggestion[]>([]);
  const [bggError, setBggError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({ title: '', box_format: 'grand' });
  const [file, setFile] = useState<File | null>(null);
  const [coverName, setCoverName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);

  async function search() {
    setBggError(null);
    const res = await fetch(`/api/bgg/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) { setBggError((await res.json()).error); return; }
    setResults((await res.json()).results);
  }
  async function pick(s: Suggestion) {
    setValues((v) => ({ ...v, title: s.name, bgg_id: String(s.bgg_id) }));
    const res = await fetch(`/api/bgg/thing?id=${s.bggId}`).catch(() => null);
    if (!res || !res.ok) return; // BGG indisponible : les champs restent à remplir à la main
    const t = (await res.json()) as Record<string, unknown>;
    setCoverName(typeof t.coverName === 'string' ? t.coverName : null);
    const str = (x: unknown) => (x == null ? undefined : String(x));
    setValues((v) => ({
      ...v,
      title: str(t.title) ?? s.name, bgg_id: str(t.bggId) ?? String(s.bggId),
      year: str(t.year) ?? v.year, publisher: str(t.publisher) ?? v.publisher,
      min_players: str(t.minPlayers) ?? v.min_players, max_players: str(t.maxPlayers) ?? v.max_players,
      playtime_min: str(t.playtimeMin) ?? v.playtime_min, weight: str(t.weight) ?? v.weight,
      bgg_rating: str(t.rating) ?? v.bgg_rating,
    }));
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    const fd = new FormData();
    Object.entries(values).forEach(([k, v]) => fd.append(k, v));
    if (file) fd.append('cover', file);
    if (coverName) fd.append('cover_name', coverName);
    const res = await fetch('/api/games', { method: 'POST', body: fd });
    setBusy(false);
    if (!res.ok) { setError((await res.json()).error); return; }
    router.push('/etagere'); router.refresh();
  }

  return (
    <form onSubmit={submit} className="add-form">
      <h1>Ajouter un jeu</h1>
      <div className="search-row">
        <input placeholder="Chercher sur BoardGameGeek…" value={q}
               onChange={(e) => setQ(e.target.value)} />
        <button type="button" onClick={search}>Chercher</button>
      </div>
      {bggError && <p className="hint" role="alert">{bggError}</p>}
      {results.length > 0 && (
        <ul className="suggestions">
          {results.slice(0, 8).map((s) => (
            <li key={s.bggId}><button type="button" onClick={() => pick(s)}>{s.name}</button></li>
          ))}
        </ul>
      )}
      <label>Titre
        <input required value={values.title}
               onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))} />
      </label>
      <label>Format de boîte
        <select value={values.box_format}
                onChange={(e) => setValues((v) => ({ ...v, box_format: e.target.value }))}>
          {FORMATS.map((f) => <option key={f} value={f}>{FORMAT_LABEL[f]}</option>)}
        </select>
      </label>
      {FIELDS.map(([k, label]) => (
        <label key={k}>{label}
          <input inputMode="decimal" value={values[k] ?? ''}
                 onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))} />
        </label>
      ))}
      <label>Pochette (optionnel)
        <input type="file" accept=".jpg,.jpeg,.png,.webp"
               onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button disabled={busy}>{busy ? 'Enregistrement…' : 'Ajouter à ma bibliothèque'}</button>
    </form>
  );
}
```

- [ ] **Step 5: `app/games/add/page.tsx`** (serveur, protégé)

```tsx
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import AddGameForm from '@/components/AddGameForm';
export default async function Page() {
  if (!getSessionUser()) redirect('/login');
  return <main className="page"><AddGameForm /></main>;
}
```

- [ ] **Step 6: `app/library/page.tsx` + `components/LibraryClient.tsx`** — liste, édition du format, suppression

```tsx
// app/library/page.tsx
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { listMyGames } from '@/lib/games';
import LibraryClient from '@/components/LibraryClient';
export default async function Page() {
  const user = getSessionUser();
  if (!user) redirect('/login');
  return <main className="page"><LibraryClient games={listMyGames(user.id)} /></main>;
}
```

```tsx
// components/LibraryClient.tsx (extrait clé : suppression avec gestion 409)
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { coverSrc } from '@/lib/formats';
import type { Game } from '@/lib/types';

export default function LibraryClient({ games: initial }: { games: Game[] }) {
  const router = useRouter();
  const [games, setGames] = useState(initial);
  const [notice, setNotice] = useState<string | null>(null);

  async function remove(id: number) {
    const res = await fetch(`/api/games/${id}`, { method: 'DELETE' });
    if (res.status === 409) { setNotice((await res.json()).error); return; }
    if (res.ok) { setGames((g) => g.filter((x) => x.id !== id)); setNotice(null); }
  }
  async function setFormat(id: number, box_format: string) {
    await fetch(`/api/games/${id}`, { method: 'PATCH',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ box_format }) });
    router.refresh();
  }
  return (
    <div>
      <h1>Ma bibliothèque</h1>
      {notice && <p className="hint" role="alert">{notice}</p>}
      {games.length === 0 && <p className="empty">Aucun jeu pour l'instant. Touchez « Ajouter » pour commencer votre étagère.</p>}
      <ul className="library">
        {games.map((g) => (
          <li key={g.id}>
            {coverSrc(g)
              ? <img src={coverSrc(g) as string} alt="" />
              : <div className="cover-placeholder">♟</div>}
            <div>
              <strong>{g.title}</strong>
              <select value={g.box_format} onChange={(e) => setFormat(g.id, e.target.value)}>
                {(['grand','moyen','petit','mini'] as const).map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <button onClick={() => remove(g.id)}>Retirer</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 7: Vérif manuelle** : `npm run dev` → ajouter « Deus » manuellement (format grand) → il apparaît dans Ma bibliothèque. **Commit** — `feat: pages ajouter + bibliothèque`

---

### Task 7: Soirées — lib + API

**Files:**
- Create: `lib/nights.ts`, `app/api/nights/route.ts`, `app/api/nights/[id]/route.ts`, `app/api/users/route.ts`
- Test: `tests/unit/nights.test.ts`

**Interfaces:**
- Produces: `getCurrentNight(userId: number): Night | null` (dernière nuit dont je suis créateur, `played_at` = aujourd'hui) ; `createNight(creatorId: number, playerIds: number[]): number` (créateur inclus automatiquement) ; `setNightPlayers(nightId: number, playerIds: number[]): void` ; `getNight(nightId: number): Night | null` ; `getNightPlayers(nightId: number): UserLite[]` ; `getShelfGames(nightId: number): Game[]` (union des jeux des joueurs présents, tri format→titre) ; `getNightPicks(nightId: number): (Pick & { title: string; pseudo: string })[]` ; `userCanAccessNight(userId: number, nightId: number): boolean`.

- [ ] **Step 1: Tests qui échouent** — `tests/unit/nights.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { registerUser } from '@/lib/auth';
import { createNight, getShelfGames, getCurrentNight, userCanAccessNight, setNightPlayers } from '@/lib/nights';
import { createGame } from '@/lib/games';

describe('nights', () => {
  it('crée une soirée, inclut le créateur, combine les bibliothèques', () => {
    const marc = (registerUser('n-marc', '1234') as { id: number }).id;
    const lea = (registerUser('n-lea', '1234') as { id: number }).id;
    createGame(marc, { title: 'Terraforming Mars', box_format: 'grand' });
    createGame(lea, { title: 'Harmonies', box_format: 'petit' });
    const nightId = createNight(marc, [marc, lea]);
    const games = getShelfGames(nightId);
    expect(games.map((g) => g.title).sort()).toEqual(['Harmonies', 'Terraforming Mars']);
    expect(getCurrentNight(marc)?.id).toBe(nightId);
    expect(userCanAccessNight(lea, nightId)).toBe(true);
    expect(userCanAccessNight(registerUser('n-autre', '1234') as { id: number }, nightId)).toBe(false);
  });
  it('modifie les joueurs présents', () => {
    const a = (registerUser('n-a', '1234') as { id: number }).id;
    const b = (registerUser('n-b', '1234') as { id: number }).id;
    const c = (registerUser('n-c', '1234') as { id: number }).id;
    const nightId = createNight(a, [a, b]);
    setNightPlayers(nightId, [a, c]);
    expect(getShelfGames(nightId)).toHaveLength(0); // b parti, c et a n'ont rien
  });
});
```

- [ ] **Step 2: Run** — `npm test` → FAIL

- [ ] **Step 3: `lib/nights.ts`**

```ts
import { getDb } from './db';
import type { Game, Night, Pick, UserLite } from './types';

export function getCurrentNight(userId: number): Night | null {
  return (getDb().prepare(
    `SELECT * FROM nights WHERE creator_id = ? AND played_at = date('now') ORDER BY id DESC LIMIT 1`)
    .get(userId) as Night | undefined) ?? null;
}
export function getNight(nightId: number): Night | null {
  return (getDb().prepare('SELECT * FROM nights WHERE id = ?').get(nightId) as Night | undefined) ?? null;
}
export function createNight(creatorId: number, playerIds: number[]): number {
  const info = getDb().prepare('INSERT INTO nights (creator_id) VALUES (?)').run(creatorId);
  const nightId = Number(info.lastInsertRowid);
  setNightPlayers(nightId, playerIds.includes(creatorId) ? playerIds : [...playerIds, creatorId]);
  return nightId;
}
export function setNightPlayers(nightId: number, playerIds: number[]): void {
  const db = getDb();
  db.prepare('DELETE FROM night_players WHERE night_id = ?').run(nightId);
  const ins = db.prepare('INSERT OR IGNORE INTO night_players (night_id, user_id) VALUES (?, ?)');
  for (const id of new Set(playerIds)) ins.run(nightId, id);
}
export function getNightPlayers(nightId: number): UserLite[] {
  return getDb().prepare(`
    SELECT u.id, u.pseudo FROM night_players np JOIN users u ON u.id = np.user_id
    WHERE np.night_id = ? ORDER BY u.pseudo`).all(nightId) as UserLite[];
}
export function userCanAccessNight(userId: number, nightId: number): boolean {
  return !!getDb().prepare(`
    SELECT 1 FROM nights n WHERE n.id = ? AND
      (n.creator_id = ? OR EXISTS (SELECT 1 FROM night_players np WHERE np.night_id = n.id AND np.user_id = ?))`)
    .get(nightId, userId, userId);
}
export function getShelfGames(nightId: number): Game[] {
  return getDb().prepare(`
    SELECT DISTINCT g.* FROM games g
    JOIN night_players np ON np.user_id = g.owner_id
    WHERE np.night_id = ?
    ORDER BY CASE g.box_format WHEN 'grand' THEN 0 WHEN 'moyen' THEN 1 WHEN 'petit' THEN 2 ELSE 3 END, g.title`)
    .all(nightId) as Game[];
}
export function getNightPicks(nightId: number): (Pick & { title: string; pseudo: string })[] {
  return getDb().prepare(`
    SELECT p.*, g.title, u.pseudo FROM picks p
    JOIN games g ON g.id = p.game_id JOIN users u ON u.id = p.spinner_id
    WHERE p.night_id = ? ORDER BY p.id DESC`).all(nightId) as (Pick & { title: string; pseudo: string })[];
}
```

- [ ] **Step 4: Routes** — `app/api/nights/route.ts`, `app/api/nights/[id]/route.ts`, `app/api/users/route.ts`

```ts
// app/api/nights/route.ts
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { createNight, getCurrentNight, getNightPlayers } from '@/lib/nights';

export async function GET() {
  const user = getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const night = getCurrentNight(user.id);
  return NextResponse.json({ night: night ? { ...night, players: getNightPlayers(night.id) } : null });
}
export async function POST(req: Request) {
  const user = getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const { playerIds } = await req.json();
  const nightId = createNight(user.id, (playerIds as number[]) ?? []);
  return NextResponse.json({ nightId });
}
```

```ts
// app/api/nights/[id]/route.ts — PATCH { playerIds }
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getNight, setNightPlayers, userCanAccessNight } from '@/lib/nights';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const nightId = Number((await params).id);
  if (!getNight(nightId) || !userCanAccessNight(user.id, nightId))
    return NextResponse.json({ error: 'Soirée introuvable' }, { status: 404 });
  const { playerIds } = await req.json();
  if (!Array.isArray(playerIds) || !playerIds.includes(user.id))
    return NextResponse.json({ error: 'Vous devez être dans la soirée' }, { status: 400 });
  setNightPlayers(nightId, playerIds);
  return NextResponse.json({ ok: true });
}
```

```ts
// app/api/users/route.ts — liste des inscrits (pour cocher les joueurs présents)
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getDb } from '@/lib/db';

export async function GET() {
  const user = getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  return NextResponse.json({ users: getDb().prepare('SELECT id, pseudo FROM users ORDER BY pseudo COLLATE NOCASE').all() });
}
```

- [ ] **Step 5: Run** — `npm test` → PASS. **Commit** — `feat: soirées (lib + API)`

---

### Task 8: Tirage — lib + API

**Files:**
- Create: `lib/draw.ts`, `app/api/draw/route.ts`
- Test: `tests/unit/draw.test.ts`

**Interfaces:**
- Produces: `pickGameId(gameIds: number[]): number` (RNG crypto, throw sur liste vide) ; `POST /api/draw` ({ nightId, gameIds } → { pickId, gameId } | { error, status }).

- [ ] **Step 1: Test qui échoue** — `tests/unit/draw.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { pickGameId } from '@/lib/draw';

describe('draw', () => {
  it('renvoie toujours un élément de la liste', () => {
    const ids = [10, 20, 30];
    for (let i = 0; i < 30; i++) expect(ids).toContain(pickGameId(ids));
  });
  it('refuse une liste vide', () => {
    expect(() => pickGameId([])).toThrow('sélection vide');
  });
});
```

- [ ] **Step 2: Run** — FAIL. Puis `lib/draw.ts` :

```ts
import { randomInt } from 'node:crypto';

export function pickGameId(gameIds: number[]): number {
  if (gameIds.length === 0) throw new Error('sélection vide');
  return gameIds[randomInt(gameIds.length)];
}
```

- [ ] **Step 3: `app/api/draw/route.ts`** — vérifie l'accès, vérifie que les jeux appartiennent bien aux joueurs présents, tire, enregistre.

```ts
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { pickGameId } from '@/lib/draw';
import { getNight, getShelfGames, userCanAccessNight } from '@/lib/nights';
import { getDb } from '@/lib/db';

export async function POST(req: Request) {
  const user = getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const { nightId, gameIds } = await req.json();
  const night = getNight(Number(nightId));
  if (!night || !userCanAccessNight(user.id, night.id))
    return NextResponse.json({ error: 'Soirée introuvable' }, { status: 404 });
  const shelf = getShelfGames(night.id);
  const allowed = new Set(shelf.map((g) => g.id));
  const ids: number[] = [...new Set((gameIds as number[]).map(Number))].filter((id) => allowed.has(id));
  if (ids.length === 0) return NextResponse.json({ error: 'Sélection vide' }, { status: 400 });
  const gameId = pickGameId(ids);
  const info = getDb().prepare('INSERT INTO picks (night_id, game_id, spinner_id) VALUES (?, ?, ?)')
    .run(night.id, gameId, user.id);
  return NextResponse.json({ pickId: Number(info.lastInsertRowid), gameId });
}
```

- [ ] **Step 4: Run** — `npm test` → PASS. **Commit** — `feat: tirage serveur (RNG crypto, enregistré avant affichage)`

---

### Task 9: Roue — math de l'animation

**Files:**
- Create: `lib/wheel.ts`
- Test: `tests/unit/wheel.test.ts`

**Interfaces:**
- Produces: `finalRotation(index: number, count: number, jitterDeg?: number): number` — degrés CSS (sens horaire) pour amener le segment `index` sous le pointeur (en haut), 5 tours complets, jitter borné à ±(180/count − 6) ; `jitterFor(count: number): number` ; `segmentAngle(count: number): number`.

- [ ] **Step 1: Tests qui échouent** — `tests/unit/wheel.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { finalRotation, jitterFor, segmentAngle } from '@/lib/wheel';

describe('wheel', () => {
  it('amène le centre du segment visé sous le pointeur (mod 360)', () => {
    const count = 7;
    for (let i = 0; i < count; i++) {
      const r = finalRotation(i, count, 0);
      const seg = segmentAngle(count);
      const landed = ((r % 360) + 360) % 360;              // rotation appliquée
      const center = (i * seg + seg / 2 + landed) % 360;   // position du centre après rotation
      expect(Math.abs(center - 360) < 0.001 || center < 0.001).toBe(true);
    }
  });
  it('fait au moins 4 tours complets', () => {
    expect(finalRotation(0, 8, 0)).toBeGreaterThanOrEqual(4 * 360);
  });
  it('le jitter reste dans le segment (pas de débordement sur le voisin)', () => {
    const count = 5; const half = 180 / count - 6;
    const j = jitterFor(count);
    expect(Math.abs(j)).toBeLessThanOrEqual(half + 0.001);
  });
});
```

- [ ] **Step 2: Run** — FAIL. Puis `lib/wheel.ts` :

```ts
export function segmentAngle(count: number): number {
  return 360 / count;
}
export function jitterFor(count: number): number {
  const max = 180 / count - 6;
  return (Math.random() * 2 - 1) * Math.max(0, max);
}
export function finalRotation(index: number, count: number, jitterDeg = 0): number {
  const seg = segmentAngle(count);
  const maxJitter = Math.max(0, seg / 2 - 6);
  const jitter = Math.max(-maxJitter, Math.min(maxJitter, jitterDeg));
  return 5 * 360 - (index * seg + seg / 2) + jitter;
}
```

- [ ] **Step 3: Run** — `npm test` → PASS. **Commit** — `feat: math roue (rotation finale testée)`

---

### Task 10: Écran Étagère (serveur + client scroll, sélection, fiche)

**Files:**
- Create: `app/etagere/page.tsx`, `components/ShelfClient.tsx`, `components/GameSheet.tsx`, `components/NightPicker.tsx`
- Create: `app/globals.css` (design system complet), `app/layout.tsx` (fonts + metadata)
- Test: `tests/e2e/etagere.spec.ts`

**Interfaces:**
- Consumes: `getCurrentNight`, `getNightPlayers`, `getShelfGames` (Task 7), `FORMATS/FORMAT_SCALE/FORMAT_LABEL/coverSrc` (Task 6), `Game/UserLite/Night`.
- Produces: URL `/etagere` (page protégée) ; `/tirage/{nightId}?games=1,2,3` (consommé par Task 11).

- [ ] **Step 1: Design system** — `app/globals.css` : variables CSS (palette §Global Constraints), classes `shelves-row` (flex, `overflow-x:auto`, `scroll-snap-type:x mandatory`), `.box` (+ `.sel` bordure cuivrée 3 px), `.selbadge` (26 px, contour sombre ; `.sm` 19 px), `.bottom-sheet`, `.tabbar`, boutons `.btn-copper`, placeholders `.cover-placeholder`. Layout : `app/layout.tsx` avec `next/font/google` (Bricolage_Grotesque, Space_Grotesk), `metadata` (title « What Shall We Play? », themeColor `#2A1F17`, `viewport` mobile).

- [ ] **Step 2: Page serveur** — `app/etagere/page.tsx`

```tsx
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { getCurrentNight, getNightPlayers, getShelfGames } from '@/lib/nights';
import ShelfClient from '@/components/ShelfClient';
import NightPicker from '@/components/NightPicker';
import { getDb } from '@/lib/db';

export default async function Page() {
  const user = getSessionUser();
  if (!user) redirect('/login');
  const night = getCurrentNight(user.id);
  if (!night) {
    const users = getDb().prepare('SELECT id, pseudo FROM users ORDER BY pseudo COLLATE NOCASE').all();
    return <main className="page"><NightPicker users={users} /></main>;
  }
  const games = getShelfGames(night.id);
  return <main className="page">
    <ShelfClient night={night} players={getNightPlayers(night.id)} games={games} />
  </main>;
}
```

- [ ] **Step 3: `components/NightPicker.tsx`** (client) — coche les joueurs présents, POST `/api/nights`, `router.refresh()`.

- [ ] **Step 4: `components/ShelfClient.tsx`** — l'écran clé : carte soirée (joueurs, « modifier » → NightPicker en sheet), rayons par format (ordre `FORMATS`), scroll horizontal avec snap, badge ✓ (`.sel` + `.selbadge`, `.sm` si scale < 0.7 — ruling SDD : seuil 0.7 retenu, la spec ne fixe que la pastille 26 px et le raffinement `.sm` vise les petites boîtes), compteur « Sélection : N jeux », CTA `Lancer le tirage · N` **désactivé si N = 0**, ouverture de `GameSheet` au clic sur une boîte.

```tsx
'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FORMATS, FORMAT_SCALE, FORMAT_LABEL, coverSrc } from '@/lib/formats';
import type { Game, Night, UserLite } from '@/lib/types';

export default function ShelfClient({ night, players, games }: {
  night: Night; players: UserLite[]; games: Game[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [detail, setDetail] = useState<Game | null>(null);
  const byFormat = useMemo(() => FORMATS.map((f) => ({ f, list: games.filter((g) => g.box_format === f) })), [games]);

  function toggle(id: number) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  async function launch() {
    if (selected.size === 0) return;
    router.push(`/tirage/${night.id}?games=${[...selected].join(',')}`);
  }
  return (
    <div className="shelf-screen">
      <header className="shelf-header">
        <h1>L'étagère</h1>
        <div className="user-chip">M ▾</div>
      </header>
      <section className="night-card">
        <span className="night-label">SOIRÉE EN COURS</span>
        <div className="chips">{players.map((p) => <span key={p.id} className="chip">🎲 {p.pseudo}</span>)}</div>
      </section>
      {byFormat.map(({ f, list }) => list.length === 0 ? null : (
        <section key={f} className="shelf-block">
          <div className="row" role="list">
            {list.map((g) => (
              <button key={g.id} role="listitem" className={`box ${selected.has(g.id) ? 'sel' : ''} ${FORMAT_SCALE[f] < 0.7 ? 'sm' : ''}`}
                      style={{ width: 96 * FORMAT_SCALE[f], height: 96 * FORMAT_SCALE[f] }}
                      onClick={() => setDetail(g)}>
                {selected.has(g.id) && <span className="selbadge">✓</span>}
                {coverSrc(g) ? <img src={coverSrc(g) as string} alt={g.title} /> : <span className="cover-placeholder">♟</span>}
              </button>
            ))}
          </div>
          <div className="rail" />
          <p className="row-label">{FORMAT_LABEL[f]} — on swipe ›</p>
        </section>
      ))}
      <div className="cta-zone">
        <span className="chip selcount">Sélection : {selected.size} {selected.size > 1 ? 'jeux' : 'jeu'} ✓</span>
        <button className="btn-copper" disabled={selected.size === 0} onClick={launch}>
          {selected.size === 0 ? 'Touchez une boîte pour l\'ajouter' : `Lancer le tirage · ${selected.size}`}
        </button>
      </div>
      {detail && <GameSheet game={detail} inSelection={selected.has(detail.id)}
                            onToggle={() => { toggle(detail.id); }} onClose={() => setDetail(null)} />}
    </div>
  );
}
```

- [ ] **Step 5: `components/GameSheet.tsx`** (bottom-sheet) — pochette, titre, année/éditeur, chips (joueurs, durée, poids, note), propriétaire + format, bouton `＋ Ajouter à la sélection` / `Retirer de la sélection`, lien BGG.

- [ ] **Step 6: Test E2E qui échoue** — `tests/e2e/etagere.spec.ts`

```ts
import { test, expect } from '@playwright/test';

test('étagère : sélection via fiche, CTA compteur', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(`shelf-${Date.now()}`);
  await page.getByLabel('Code secret').fill('1234');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await page.goto('/games/add');
  await page.getByLabel('Titre').fill('Terraforming Mars');
  await page.getByLabel('Format de boîte').selectOption('grand');
  await page.getByRole('button', { name: 'Ajouter à ma bibliothèque' }).click();
  // Soirée : se cocher soi-même
  await page.getByRole('checkbox').first().check();
  await page.getByRole('button', { name: /Lancer la soirée|Créer la soirée/ }).click();
  // Étagère : boîte -> fiche -> ajouter
  await page.locator('.box').first().click();
  await page.getByRole('button', { name: /Ajouter à la sélection/ }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.selcount')).toContainText('Sélection : 1');
  await expect(page.getByRole('button', { name: /Lancer le tirage · 1/ })).toBeEnabled();
});
```

- [ ] **Step 7: Run** — Les pseudos E2E sont suffixés `Date.now()` pour permettre les relances ; pour repartir d'une base vide : `rm -rf data`. Run: `npm run test:e2e` → PASS (dev server auto-démarré). **Commit** — `feat: écran étagère (scroll, sélection, fiche)`

---

### Task 11: Écran Tirage (roue plein écran + verdict)

**Files:**
- Create: `app/tirage/[nightId]/page.tsx`, `components/TirageClient.tsx`, `components/Wheel.tsx`
- Test: `tests/e2e/tirage.spec.ts`

**Interfaces:**
- Consumes: `finalRotation/jitterFor` (Task 9), `POST /api/draw` (Task 8), `coverSrc`.
- Produces: `/tirage/{nightId}?games=…` → affiche la roue, POST au montage, verdict inline, « Relancer » re-POST.

- [ ] **Step 1: Page serveur** — `app/tirage/[nightId]/page.tsx` : session + `userCanAccessNight` (sinon 404) → récupère les `Game` de la liste `games` du query → `<TirageClient nightId games={games} />`.

- [ ] **Step 2: `components/Wheel.tsx`** — SVG `conic` en segments (couleurs alternées cuivre/bois/bleu/vert), pochettes positionnées comme dans la maquette (`transform: translate(-50%,-50%) rotate(a) translateY(-r) rotate(-a)`), wrapper avec `style={{ transform: rotate(${rotation}deg), transition: 'transform 3.5s cubic-bezier(.15,.9,.25,1)' }}`, pointeur ▼ fixe en haut, moyeu ♟.

- [ ] **Step 3: `components/TirageClient.tsx`** — au montage : `POST /api/draw` → `{ pickId, gameId }` ; calcule `finalRotation(indexOf(gameId), count, jitterFor(count))` ; après 3,6 s : état `verdict` + `navigator.vibrate?.(80)` ; verdict = pochette sous projecteur, titre, chips stats, « Sortir la boîte 📦 » (passe en « Boîte sortie ✓ »), « Relancer » (re-POST, nouvelle rotation). `prefers-reduced-motion` : transition 0,4 s.

- [ ] **Step 4: Test E2E** — `tests/e2e/tirage.spec.ts` : crée un compte + un jeu + soirée (helpers), va sur `/etagere`, sélectionne, lance → attend `LA ROUE A PARLÉ` (timeout 10 s) → le titre affiché est celui du jeu ajouté → bouton « Relancer le tirage » visible.

- [ ] **Step 5: Run** — `npm run test:e2e` → PASS. **Commit** — `feat: écran tirage (roue animée + verdict)`

---

### Task 12: Soirées (historique)

**Files:**
- Create: `app/nights/page.tsx`
- Test: `tests/e2e/nights.spec.ts`

- [ ] **Step 1: Page serveur** — liste des soirées où j'ai accès (`nights` créées par moi ou auxquelles je participe, la plus récente d'abord) ; pour chacune : date, joueurs, jeux tirés (`getNightPicks`). Ligne vide → « Aucune soirée pour l'instant. Lancez votre première depuis l'étagère. »
- [ ] **Step 2: E2E** — après un tirage (helpers du Task 11), `/nights` affiche la date et le titre du jeu tiré. Run → PASS. **Commit** — `feat: historique des soirées`

---

### Task 13: PWA (manifest, icône, service worker minimal)

**Files:**
- Create: `app/manifest.ts`, `public/icon.svg`, `public/sw.js`, `components/RegisterSW.tsx` (monté dans `app/layout.tsx`)

- [ ] **Step 1: `app/manifest.ts`**

```ts
import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'What Shall We Play?', short_name: 'WSP', start_url: '/etagere',
    display: 'standalone', background_color: '#2A1F17', theme_color: '#2A1F17',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
```

- [ ] **Step 2: `public/sw.js`** — cache-first sur `/_next/static/` et `/api/cover/` :

```js
const CACHE = 'wsp-v1';
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const cacheable = url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/api/cover/');
  if (!cacheable) return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
    const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res;
  })));
});
```

`RegisterSW.tsx` : `navigator.serviceWorker.register('/sw.js')` dans un `useEffect`. **Vérif** : Lighthouse/DevTools → « installable ». **Commit** — `feat: pwa installable`

---

### Task 14: Docker + E2E parcours complet + README

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`, `README.md`
- Create: `tests/e2e/parcours.spec.ts`

- [ ] **Step 1: Dockerfile** (multi-stage, cf. spec §9) + `docker-compose.yml` :

```yaml
services:
  app:
    build: .
    ports: ["3000:3000"]
    environment:
      - BGG_TOKEN=${BGG_TOKEN:-}
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

- [ ] **Step 2: E2E parcours complet** — `tests/e2e/parcours.spec.ts` :

```ts
import { test, expect } from '@playwright/test';

const stamp = Date.now();

test('parcours complet : deux joueurs, sélection, tirage, historique', async ({ browser }) => {
  const ctxA = await browser.newContext(); const a = await ctxA.newPage();
  await a.goto('/register');
  await a.getByLabel('Pseudo').fill(`parc-marc-${stamp}`);
  await a.getByLabel('Code secret').fill('1234');
  await a.getByRole('button', { name: 'Créer mon compte' }).click();

  // Marc ajoute un jeu SANS pochette (Review Focus n°1 : placeholder ♟)
  await a.goto('/games/add');
  await a.getByLabel('Titre').fill('Terraforming Mars');
  await a.getByLabel('Format de boîte').selectOption('grand');
  await a.getByRole('button', { name: 'Ajouter à ma bibliothèque' }).click();

  // Léa s'inscrit et ajoute son jeu
  const ctxB = await browser.newContext(); const b = await ctxB.newPage();
  await b.goto('/register');
  await b.getByLabel('Pseudo').fill(`parc-lea-${stamp}`);
  await b.getByLabel('Code secret').fill('1234');
  await b.getByRole('button', { name: 'Créer mon compte' }).click();
  await b.goto('/games/add');
  await b.getByLabel('Titre').fill('Harmonies');
  await b.getByLabel('Format de boîte').selectOption('petit');
  await b.getByRole('button', { name: 'Ajouter à ma bibliothèque' }).click();

  // Marc crée la soirée avec Léa
  await a.goto('/etagere');
  await a.getByLabel(new RegExp(`parc-lea-${stamp}`)).check();
  await a.getByRole('button', { name: /Créer la soirée/ }).click();

  // Les deux bibliothèques sont sur l'étagère ; sélection + tirage
  await expect(a.locator('.box')).toHaveCount(2);
  await a.locator('.box').nth(0).click();
  await a.getByRole('button', { name: /Ajouter à la sélection/ }).click();
  await a.keyboard.press('Escape');
  await a.locator('.box').nth(1).click();
  await a.getByRole('button', { name: /Ajouter à la sélection/ }).click();
  await a.keyboard.press('Escape');
  await a.getByRole('button', { name: /Lancer le tirage · 2/ }).click();
  await expect(a.getByText('LA ROUE A PARLÉ')).toBeVisible({ timeout: 10_000 });

  // Historique
  await a.goto('/nights');
  await expect(a.getByText(/Terraforming Mars|Harmonies/)).toBeVisible();
});
```

- [ ] **Step 3: Run** — `npm run test:e2e` → PASS (tous les specs). `npm test` → PASS.
- [ ] **Step 4: Build Docker** — `docker compose up --build` → l'app répond sur :3000, `/etagere` accessible.
- [ ] **Step 5: README** — présentation, `npm run dev`, déploiement VPS (compose + reverse proxy HTTPS + `BGG_TOKEN`), sauvegarde du volume `./data`.
- [ ] **Step 6: Commit final** — `git add -A && git commit -m "feat: docker + parcours e2e complet"` puis `git push`.
