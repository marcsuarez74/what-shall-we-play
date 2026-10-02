# Rapporter un bug — Plan d'implémentation (v3.4.0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Les joueurs remontent bugs et améliorations depuis l'app (menu → `/bugs`) ; le serveur ouvre une issue GitHub complète (contexte technique automatique, capture jointe optionnelle).

**Architecture:** Formulaire client → `POST /api/bugs` (multipart, session requise) → `lib/bugs.ts` (validation, quota 3/jour, corps markdown) → API GitHub côté serveur avec `GITHUB_BUG_TOKEN` (jamais côté client). Captures jointes stockées sur le VPS (`DATA_DIR/bugs/`), servies par une route publique à nom-uuid, URL intégrée dans l'issue. Chaque rapport réussi est gardé en table `bug_reports` (audit + quota).

**Tech Stack:** Next.js App Router + TypeScript, better-sqlite3, Vitest (fetch GitHub mocké), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-02-rapporter-un-bug-design.md` (lire avec ce plan — le plan argumente depuis la spec).

## Global Constraints

- UI 100 % français ; palette noyer `#2A1F17` / surface `#3A2B1F` / crème `#F3E9DC` / cuivre `#C96F3B` / vert `#3E9B6E` ; Bricolage Grotesque + Space Grotesque.
- **Aucune nouvelle dépendance npm** (html2canvas écarté — pas de capture auto, choix utilisateur).
- Champs de saisie `font-size: 16px` minimum (ruling zoom iOS v3.2).
- `GITHUB_BUG_TOKEN` uniquement côté serveur : jamais dans une réponse, un log ou le bundle client.
- Les variables GitHub se lisent **dans les fonctions** (pas au niveau module) — sinon les tests ne peuvent pas les stubber.
- Une ligne `bug_reports` n'est insérée QUE si l'issue est créée (les échecs ne consomment pas le quota).
- E2E : `DATA_DIR` hors projet via `playwright.config.ts` ; workers 1 ; ne jamais éditer de fichiers pendant une suite (Turbopack surveille la racine). Vitest : `fileParallelism: false`, `.tmp-vitest` déjà configuré.
- TDD strict : rouge observé puis vert. Suites de référence avant release : `npx vitest run`, `npx playwright test`, `npx tsc --noEmit`, `npm run build` ; deux runs CI verts avant merge ; tag après fusion.
- Navigation interne : `<Link>` de `next/link` (règle ESLint `no-html-link-for-pages`, échec de build v3.3.1).

## Review Focus

1. **Jeton absent ou mal configuré en prod** : le formulaire s'affiche, l'envoi renvoie 503 avec un message français, aucun crash serveur, aucune ligne en base. → Pin : T2 (test « token absent → 503 ») + T5 (E2E sans jeton en CI).
2. **GitHub indisponible** (4xx/5xx/timeout réseau) : 502 « ton signalement n'est pas perdu », **aucune ligne en base, quota non consommé**. → Pin : T2 (test échec 500 → 502 + compteur `bug_reports` à 0).
3. **Capture piégeuse** : traversée `../`, ext exotique, nom falsifié, fichier trop lourd → 400 à l'upload, 404 au service, jamais d'accès disque hors `DATA_DIR/bugs/` (regex uuid stricte + `path.basename`). → Pin : T1 (tests `isSafeCaptureName`) + T2 (refus 5 Mo / ext).
4. **Quota** : 4ᵉ signalement du jour → 429 en français ; le lendemain ça repasse (comparaison `date(created_at)` locale). → Pin : T2 (test 3 OK puis 429).
5. **Repost après succès** (double-tap, refresh de l'écran succès) : un seul POST par envoi — bouton désactivé pendant l'envoi ; l'écran succès est un état client (le refresh remet un formulaire vierge, ne reposte pas). → Pin : T5 (bouton désactivé pendant `envoi`, succès en état) + revue finale.

---

### Task 1: Table `bug_reports` + stockage des captures

**Files:**
- Modify: `lib/db.ts` (SCHEMA — ajouter la table après `night_scores`)
- Modify: `lib/storage.ts` (bloc captures après `coverPathOnDisk`)
- Test: `tests/unit/db.test.ts` (append), `tests/unit/storage.test.ts` (create)

**Interfaces:**
- Produces: table `bug_reports` (voir SQL) ; `saveBugCapture(buf: Buffer, ext: CoverExt): string` ; `isSafeCaptureName(name: string): boolean` ; `bugCapturePath(name: string): string` ; `CoverExt`/`COVER_EXT` existants (`'jpg'|'jpeg'|'png'|'webp'`).
- Consumed by: T2 (captureName), T3 (les deux routes).

- [ ] **Step 1: Test rouge** — append à `tests/unit/db.test.ts` :

```ts
it('v3.4 : table bug_reports prête (défaut de date locale, issue_url nullable)', () => {
  const db = getDb();
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map((r: { name: string }) => r.name);
  expect(tables).toContain('bug_reports');
  const u = db.prepare(`INSERT INTO users (pseudo, code_hash) VALUES ('bug-user', 'x')`).run();
  const info = db.prepare(`INSERT INTO bug_reports (user_id, type, titre) VALUES (?, 'bug', 'test')`).run(u.lastInsertRowid);
  const row = db.prepare('SELECT created_at, issue_url, capture_name FROM bug_reports WHERE id = ?').get(info.lastInsertRowid) as { created_at: string; issue_url: string | null; capture_name: string | null };
  expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  expect(row.issue_url).toBeNull();
  expect(row.capture_name).toBeNull();
});
```

Create `tests/unit/storage.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { saveBugCapture, isSafeCaptureName, bugCapturePath } from '@/lib/storage';

describe('captures de bugs (DATA_DIR/bugs)', () => {
  it('sauvegarde avec un nom uuid sûr, dans DATA_DIR/bugs', () => {
    const name = saveBugCapture(Buffer.from('png-fake'), 'png');
    expect(isSafeCaptureName(name)).toBe(true);
    const p = bugCapturePath(name);
    expect(p.startsWith(process.env.DATA_DIR!)).toBe(true);
    expect(fs.readFileSync(p).toString()).toBe('png-fake');
  });
  it('rejette les noms dangereux : traversée, ext exotique, casse, nom trop long', () => {
    for (const n of ['../../etc/passwd.png', 'a.png.exe', 'A-UUID.PNG', '', '.png', `${'a'.repeat(80)}.png`])
      expect(isSafeCaptureName(n)).toBe(false);
  });
});
```

- [ ] **Step 2: Rouge** — `npx vitest run tests/unit/db.test.ts tests/unit/storage.test.ts` → FAIL (`bug_reports` absent de sqlite_master ; `saveBugCapture` non exporté).

- [ ] **Step 3: Implémenter** — `lib/db.ts`, dans le `SCHEMA` juste après `night_scores` :

```sql
CREATE TABLE IF NOT EXISTS bug_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  titre TEXT NOT NULL,
  issue_url TEXT,
  capture_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
```

`lib/storage.ts` — bloc à la fin du fichier :

```ts
// v3.4 — captures jointes aux signalements : dossier séparé, nom = uuid v4
// (regex stricte : l'URL de service est publique, elle ne doit rien traverser).
const BUGS_DIR = path.join(DATA_DIR, 'bugs');
const UUID_FILE_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(jpg|jpeg|png|webp)$/;
export function isSafeCaptureName(name: string): boolean {
  return UUID_FILE_RE.test(name);
}
export function saveBugCapture(buf: Buffer, ext: CoverExt): string {
  fs.mkdirSync(BUGS_DIR, { recursive: true });
  const name = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(BUGS_DIR, name), buf);
  return name;
}
export function bugCapturePath(name: string): string {
  return path.join(BUGS_DIR, path.basename(name));
}
```

- [ ] **Step 4: Vert** — `npx vitest run` (suite complète) → PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(bugs): table bug_reports + stockage des captures (DATA_DIR/bugs)"`

---

### Task 2: `lib/bugs.ts` — validation, quota, corps markdown, ouverture d'issue

**Files:**
- Create: `lib/bugs.ts`
- Test: `tests/unit/bugs.test.ts` (create)

**Interfaces:**
- Consumes: T1 (table `bug_reports`).
- Produces (exact, pour T3) :
  - `export type BugType = 'bug' | 'amelioration'`
  - `export type BugResult = { ok: true; issueUrl: string; issueNumber: number } | { error: string; status: number }`
  - `export type BugInput = { userId: number; pseudo: string; type: BugType; title: string; description: string; page: string; device: { appareil: string; navigateur: string; ecran: string; langue: string; installation: string }; uaBrut: string; captureName?: string | null }`
  - `export function validerSignalement(input: { title: string; description: string; type: string }): { error: string; status: number } | null`
  - `export function corpsIssue(input: CorpsInput): string` avec `CorpsInput = { type: BugType; description: string; page: string; version: string; appareil: string; navigateur: string; ecran: string; langue: string; installation: string; uaBrut: string; pseudo: string; captureUrl?: string | null }`
  - `export async function createBugReport(input: BugInput): Promise<BugResult>`
- Env lues **dans** `createBugReport` (jamais au niveau module, pour `vi.stubEnv`) : `GITHUB_BUG_TOKEN` (requis), `GITHUB_REPO` (défaut `marcsuarez74/what-shall-we-play`), `GITHUB_API` (défaut `https://api.github.com`), `PUBLIC_URL` (défaut `https://etagere.marc-suarez.fr`).

- [ ] **Step 1: Test rouge** — create `tests/unit/bugs.test.ts` :

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerUser } from '@/lib/auth';
import { createBugReport, corpsIssue, validerSignalement } from '@/lib/bugs';
import { getDb } from '@/lib/db';
import pkg from '../../package.json';

const uid = (p: string) => (registerUser(p, '1234') as { id: number }).id;
const input = (userId: number, pseudo: string) => ({
  userId, pseudo, type: 'bug' as const, title: 'La roue reste bloquée',
  description: 'La roue tourne mais le verdict n\u2019apparaît jamais.',
  page: '/tirage/12',
  device: { appareil: 'iPhone', navigateur: 'Safari 18', ecran: '390×844 @3x', langue: 'fr', installation: 'installée' },
  uaBrut: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)',
});
const issueOk = (n: number) => new Response(JSON.stringify({ number: n, html_url: `https://github.com/org/repo-test/issues/${n}` }), { status: 201 });

describe('validerSignalement', () => {
  it('borne titre et description, type whitelisté', () => {
    expect(validerSignalement({ title: 'ab', description: 'x'.repeat(20), type: 'bug' })).toEqual({ error: 'Titre : entre 3 et 120 caractères', status: 400 });
    expect(validerSignalement({ title: 'ok titre', description: 'court', type: 'bug' })!.status).toBe(400);
    expect(validerSignalement({ title: 'ok titre', description: 'x'.repeat(4001), type: 'bug' })!.status).toBe(400);
    expect(validerSignalement({ title: 'ok titre', description: 'x'.repeat(20), type: 'virus' })!.status).toBe(400);
    expect(validerSignalement({ title: 'ok titre', description: 'x'.repeat(20), type: 'amelioration' })).toBeNull();
  });
});

describe('corpsIssue', () => {
  it('assemble description, contexte, capture conditionnelle et UA brut', () => {
    const corps = corpsIssue({ type: 'bug', description: 'Ça bloque.', page: '/tirage/12', version: pkg.version,
      appareil: 'iPhone', navigateur: 'Safari 18', ecran: '390×844 @3x', langue: 'fr', installation: 'installée',
      uaBrut: 'UA-TEST', pseudo: 'Marc', captureUrl: 'https://x.y/api/bugs/capture/a.png' });
    expect(corps).toContain('## Description\n\nÇa bloque.');
    expect(corps).toContain('- Page : `/tirage/12` · app `v' + pkg.version + '`');
    expect(corps).toContain('- Appareil : iPhone · Safari 18 · écran 390×844 @3x');
    expect(corps).toContain('- Langue : fr · installée');
    expect(corps).toContain('- Signalé par **Marc** le ');
    expect(corps).toContain('![capture](https://x.y/api/bugs/capture/a.png)');
    expect(corps).toContain('<details><summary>User-Agent brut</summary>');
    expect(corps).toContain('UA-TEST');
    const sans = corpsIssue({ type: 'amelioration', description: 'Idée : un mode night.', page: '/nights', version: pkg.version,
      appareil: 'iPhone', navigateur: 'Safari 18', ecran: '1×1', langue: 'fr', installation: 'navigateur', uaBrut: 'U', pseudo: 'L' });
    expect(sans).not.toContain('![capture]');
  });
});

describe('createBugReport', () => {
  beforeEach(() => { vi.stubEnv('GITHUB_BUG_TOKEN', 'jeton-test'); vi.stubEnv('GITHUB_REPO', 'org/repo-test'); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('ouvre l\u2019issue (titre préfixé, label), l\u2019enregistre et renvoie son URL', async () => {
    const fetchMock = vi.fn(async () => issueOk(14));
    vi.stubGlobal('fetch', fetchMock);
    const marc = uid('bug-marc');
    const r = await createBugReport(input(marc, 'bug-marc'));
    expect(r).toEqual({ ok: true, issueUrl: 'https://github.com/org/repo-test/issues/14', issueNumber: 14 });
    const [url, opts] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/repos/org/repo-test/issues');
    expect(JSON.parse(String(opts.body)).title).toBe('[Bug] La roue reste bloquée');
    expect(JSON.parse(String(opts.body)).labels).toEqual(['bug']);
    const row = getDb().prepare('SELECT issue_url, type FROM bug_reports WHERE user_id = ?').get(marc) as { issue_url: string; type: string };
    expect(row.issue_url).toBe('https://github.com/org/repo-test/issues/14');
    expect(row.type).toBe('bug');
  });

  it('amélioration : préfixe et label ✨', async () => {
    const fetchMock = vi.fn(async () => issueOk(15));
    vi.stubGlobal('fetch', fetchMock);
    await createBugReport({ ...input(uid('bug-amelio'), 'bug-amelio'), type: 'amelioration' });
    const [, opts] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(opts.body)).title).toBe('[Amélioration] La roue reste bloquée');
    expect(JSON.parse(String(opts.body)).labels).toEqual(['amélioration']);
  });

  it('quota : 3 OK puis 429 — et les échecs ne consomment pas le quota', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => issueOk(1)));
    const lea = uid('bug-lea');
    for (let i = 0; i < 3; i++) expect((await createBugReport(input(lea, 'bug-lea'))).ok).toBe(true);
    expect((await createBugReport(input(lea, 'bug-lea'))).status).toBe(429);
    // échec GitHub : pas d'insertion → le compte d'un autre joueur part de zéro
    const zoe = uid('bug-zoe');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"boom"}', { status: 500 })));
    expect((await createBugReport(input(zoe, 'bug-zoe'))).status).toBe(502);
    expect((getDb().prepare('SELECT COUNT(*) AS t FROM bug_reports WHERE user_id = ?').get(zoe) as { t: number }).t).toBe(0);
  });

  it('token absent → 503 ; réseau en échec → 502', async () => {
    vi.stubEnv('GITHUB_BUG_TOKEN', '');
    const r = await createBugReport(input(uid('bug-sans'), 'bug-sans'));
    expect(r).toEqual({ error: 'Signalement indisponible pour le moment — réessaie plus tard', status: 503 });
    vi.stubEnv('GITHUB_BUG_TOKEN', 'jeton-test');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('réseau'); }));
    const r2 = await createBugReport(input(uid('bug-off'), 'bug-off'));
    expect(r2.status).toBe(502);
  });
});
```

- [ ] **Step 2: Rouge** — `npx vitest run tests/unit/bugs.test.ts` → FAIL (`@/lib/bugs` introuvable).

- [ ] **Step 3: Implémenter** — create `lib/bugs.ts` :

```ts
// lib/bugs.ts — le relais de signalement : validation, quota, corps markdown,
// ouverture de l'issue via l'API GitHub. Le jeton vit côté serveur uniquement ;
// les env se lisent DANS createBugReport (pas au module) pour rester testables.
import { getDb } from './db';
import pkg from '../package.json';

export type BugType = 'bug' | 'amelioration';
export type BugResult =
  | { ok: true; issueUrl: string; issueNumber: number }
  | { error: string; status: number };
export type BugInput = {
  userId: number; pseudo: string; type: BugType;
  title: string; description: string; page: string;
  device: { appareil: string; navigateur: string; ecran: string; langue: string; installation: string };
  uaBrut: string; captureName?: string | null;
};

const LABELS: Record<BugType, string> = { bug: 'bug', amelioration: 'amélioration' };
const PREFIXES: Record<BugType, string> = { bug: '[Bug] ', amelioration: '[Amélioration] ' };
const QUOTA_JOUR = 3;

export function validerSignalement(input: { title: string; description: string; type: string }): { error: string; status: number } | null {
  const titre = input.title.trim();
  if (titre.length < 3 || titre.length > 120) return { error: 'Titre : entre 3 et 120 caractères', status: 400 };
  const desc = input.description.trim();
  if (desc.length < 10 || desc.length > 4000) return { error: 'Description : entre 10 et 4000 caractères', status: 400 };
  if (input.type !== 'bug' && input.type !== 'amelioration') return { error: 'Type de signalement inconnu', status: 400 };
  return null;
}

const deux = (n: number) => String(n).padStart(2, '0');
function maintenant(): string {
  const d = new Date();
  return `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()} à ${deux(d.getHours())}:${deux(d.getMinutes())}`;
}

export type CorpsInput = {
  type: BugType; description: string; page: string; version: string;
  appareil: string; navigateur: string; ecran: string; langue: string; installation: string;
  uaBrut: string; pseudo: string; captureUrl?: string | null;
};

export function corpsIssue(input: CorpsInput): string {
  const lignes: string[] = [
    '## Description',
    input.description.trim(),
    '',
    '## Contexte',
    `- Page : \`${input.page}\` · app \`v${input.version}\``,
    `- Appareil : ${input.appareil} · ${input.navigateur} · écran ${input.ecran}`,
    `- Langue : ${input.langue} · ${input.installation}`,
    `- Signalé par **${input.pseudo}** le ${maintenant()}`,
  ];
  if (input.captureUrl) lignes.push('', `![capture](${input.captureUrl})`);
  lignes.push('', '<details><summary>User-Agent brut</summary>', '', input.uaBrut, '', '</details>');
  return lignes.join('\n');
}

export async function createBugReport(input: BugInput): Promise<BugResult> {
  const invalide = validerSignalement({ title: input.title, description: input.description, type: input.type });
  if (invalide) return invalide;

  const db = getDb();
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM bug_reports WHERE user_id = ? AND date(created_at) = date('now','localtime')`)
    .get(input.userId) as { total: number };
  if (total >= QUOTA_JOUR) return { error: 'Tu as déjà envoyé 3 signalements aujourd\u2019hui — à demain !', status: 429 };

  const token = process.env.GITHUB_BUG_TOKEN;
  if (!token) return { error: 'Signalement indisponible pour le moment — réessaie plus tard', status: 503 };

  const repo = process.env.GITHUB_REPO || 'marcsuarez74/what-shall-we-play';
  const api = process.env.GITHUB_API || 'https://api.github.com';
  const host = process.env.PUBLIC_URL || 'https://etagere.marc-suarez.fr';
  const body = corpsIssue({
    type: input.type, description: input.description, page: input.page, version: pkg.version,
    appareil: input.device.appareil || 'inconnu', navigateur: input.device.navigateur || 'inconnu',
    ecran: input.device.ecran || 'inconnu', langue: input.device.langue || 'fr', installation: input.device.installation || 'navigateur',
    uaBrut: input.uaBrut, pseudo: input.pseudo,
    captureUrl: input.captureName ? `${host}/api/bugs/capture/${input.captureName}` : null,
  });

  let res: Response;
  try {
    res = await fetch(`${api}/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: `${PREFIXES[input.type]}${input.title.trim()}`, body, labels: [LABELS[input.type]] }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { error: 'GitHub n\u2019a pas répondu — ton signalement n\u2019est pas perdu, réessaie', status: 502 };
  }
  if (!res.ok) return { error: 'GitHub n\u2019a pas répondu — ton signalement n\u2019est pas perdu, réessaie', status: 502 };

  const issue = (await res.json()) as { number: number; html_url: string };
  // Le quota ne compte que les signalements qui ont DÉBOUCHÉ sur une issue.
  db.prepare('INSERT INTO bug_reports (user_id, type, titre, issue_url, capture_name) VALUES (?, ?, ?, ?, ?)')
    .run(input.userId, input.type, input.title.trim(), issue.html_url, input.captureName ?? null);
  return { ok: true, issueUrl: issue.html_url, issueNumber: issue.number };
}
```

- [ ] **Step 4: Vert** — `npx vitest run` → PASS (aucune régression).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(bugs): lib de signalement — validation, quota 3/jour, corps markdown, issue GitHub"`

---

### Task 3: Routes API — `POST /api/bugs` + service des captures

**Files:**
- Create: `app/api/bugs/route.ts`
- Create: `app/api/bugs/capture/[name]/route.ts`

**Interfaces:**
- Consumes: T1 (`saveBugCapture`, `COVER_EXT`, `CoverExt`), T2 (`createBugReport`, `BugType`).
- Produces: `POST /api/bugs` (multipart: `title`, `type`, `description`, `page`, `device` JSON, `capture` File) → `{ ok, issueUrl, issueNumber }` ou `{ error }` 400/401/429/502/503 ; `GET /api/bugs/capture/<uuid.ext>` → image publique (200, immutable) ou 404.

- [ ] **Step 1: Implémenter** — create `app/api/bugs/route.ts` :

```ts
// POST : un signalement → issue GitHub. Le navigateur n'appelle jamais
// GitHub : la route sert de relais (jeton serveur), et la capture éventuelle
// est stockée sur le VPS avant l'assemblage du corps markdown.
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { createBugReport, type BugType } from '@/lib/bugs';
import { saveBugCapture, COVER_EXT, type CoverExt } from '@/lib/storage';

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
  const champ = (k: string) => { const v = form.get(k); return typeof v === 'string' ? v : ''; };

  let device: Record<string, unknown> = {};
  try { device = JSON.parse(champ('device')); } catch { /* bloc technique absent : le corps reste correct */ }
  const d = (k: string) => (typeof device[k] === 'string' && (device[k] as string).length <= 120 ? (device[k] as string) : '');

  let captureName: string | null = null;
  const file = form.get('capture');
  if (file instanceof File && file.size > 0) {
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'Capture : 5 Mo maximum' }, { status: 400 });
    const ext = (file.name.split('.').pop() ?? '').toLowerCase();
    if (!(COVER_EXT as readonly string[]).includes(ext)) return NextResponse.json({ error: 'Capture : jpg, png ou webp uniquement' }, { status: 400 });
    captureName = saveBugCapture(Buffer.from(await file.arrayBuffer()), ext as CoverExt);
  }

  const res = await createBugReport({
    userId: user.id, pseudo: user.pseudo, type: champ('type') as BugType,
    title: champ('title'), description: champ('description'), page: champ('page'),
    device: { appareil: d('appareil'), navigateur: d('navigateur'), ecran: d('ecran'), langue: d('langue'), installation: d('installation') },
    uaBrut: req.headers.get('user-agent') ?? 'inconnu', captureName,
  });
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json(res);
}
```

Create `app/api/bugs/capture/[name]/route.ts` (pattern de `app/api/cover/[name]/route.ts`) :

```ts
// GET : sert une capture jointe à une issue. Public (GitHub doit l'afficher)
// mais le nom est un uuid v4 non devinable — regex stricte, jamais de
// traversée hors DATA_DIR/bugs.
import fs from 'node:fs';
import { NextResponse } from 'next/server';
import { isSafeCaptureName, bugCapturePath } from '@/lib/storage';

const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const name = (await params).name;
  if (!isSafeCaptureName(name)) return new NextResponse('Not found', { status: 404 });
  const p = bugCapturePath(name);
  if (!fs.existsSync(p)) return new NextResponse('Not found', { status: 404 });
  const ext = name.split('.').pop() as string;
  return new NextResponse(fs.readFileSync(p), {
    headers: { 'Content-Type': MIME[ext], 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
}
```

- [ ] **Step 2: Vérifier** — `npx tsc --noEmit` propre ; `npx vitest run` vert (les routes sont fines : logique déjà testée en T2, parcours HTTP en T5).

- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat(bugs): routes API — relais de signalement + service des captures à uuid"`

---

### Task 4: Le menu — « 🐞 Rapporter un bug »

**Files:**
- Modify: `components/UserMenu.tsx`
- Test: `tests/e2e/bugs.spec.ts` (create)

**Interfaces:**
- Produces: entrée `<Link href="/bugs">` dans le menu utilisateur (sous « Se déconnecter », au-dessus de la version) ; « Mon profil » passe en `<Link>` ; le lien porte la page courante en `?depuis=` (règle la « page d'origine » de la spec).

- [ ] **Step 1: Test rouge** — create `tests/e2e/bugs.spec.ts` :

```ts
import { test, expect, Page } from '@playwright/test';

// Aide locale : inscription via l'UI (pseudos ≤ 20 caractères — ruling v3.2).
async function register(page: Page, pseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const reg = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await reg;
}

test('menu : « Rapporter un bug » présent et mène à /bugs', async ({ page }) => {
  await register(page, `menu-${Date.now().toString(36)}`);
  await page.goto('/etagere');
  await page.locator('.user-chip summary').click();
  const lien = page.getByRole('link', { name: /Rapporter un bug/ });
  await expect(lien).toBeVisible();
  await lien.click();
  await page.waitForURL('**/bugs**');
});
```

- [ ] **Step 2: Rouge** — `npx playwright test tests/e2e/bugs.spec.ts` → FAIL (lien absent, navigation impossible).

- [ ] **Step 3: Implémenter** — `components/UserMenu.tsx` :

```tsx
'use client';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import pkg from '../package.json';
import { avatarSrc } from '@/lib/formats';
import type { UserLite } from '@/lib/types';
```

dans le composant (la page courante part avec le lien — `usePathname` du menu, pas de `/bugs`) :

```tsx
  const pathname = usePathname();
```

et dans le menu :

```tsx
      <div className="user-menu">
        <Link href="/profil">Mon profil</Link>
        <button type="button" onClick={logout}>Se déconnecter</button>
        <Link href={{ pathname: '/bugs', query: { depuis: pathname } }}>🐞 Rapporter un bug</Link>
        <span className="user-version">v{pkg.version}</span>
      </div>
```

- [ ] **Step 4: Vert + tsc** — `npx playwright test tests/e2e/bugs.spec.ts` PASS ; `npx tsc --noEmit` propre.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(bugs): entrée « Rapporter un bug » dans le menu (page d'origine en ?depuis=)"`

---

### Task 5: L'écran `/bugs` — formulaire, infos techniques, envoi, succès

**Files:**
- Create: `app/bugs/page.tsx`
- Create: `components/BugReportClient.tsx`
- Modify: `app/globals.css` (bloc bugs à la fin)
- Test: `tests/e2e/bugs.spec.ts` (append)

**Interfaces:**
- Consumes: T3 (`POST /api/bugs`), T4 (`?depuis=`), `pkg.version`.
- Produces: page `/bugs` (session requise) ; `BugReportClient({ pseudo }: { pseudo: string })` ; classes CSS `.bug-*`.

- [ ] **Step 1: Test rouge** — append à `tests/e2e/bugs.spec.ts` :

```ts
test('rapport : infos visibles, bouton verrouillé tant que c\u2019est incomplet, 503 propre sans jeton', async ({ page }) => {
  await register(page, `bug-${Date.now().toString(36)}`);
  await page.goto('/bugs');
  await expect(page.getByRole('heading', { name: 'Rapporter un bug' })).toBeVisible();
  // transparence : les infos techniques sont affichées avant l'envoi
  await expect(page.locator('.bug-infos')).toContainText(/v\d+\.\d+\.\d+/);
  await expect(page.locator('.bug-infos')).toContainText('Page');
  // bouton verrouillé tant que titre/description ne passent pas
  const titre = page.getByLabel('Titre');
  const description = page.getByLabel('Description');
  await titre.fill('ab');
  await description.fill('Une description suffisamment longue pour le test.');
  await expect(page.getByRole('button', { name: /Envoyer le signalement/ })).toBeDisabled();
  // bascule de type : le libellé suit
  await page.getByRole('button', { name: /Amélioration/ }).click();
  await expect(page.getByRole('button', { name: /Proposer l\u2019amélioration/ })).toBeDisabled();
  await page.getByRole('button', { name: /Bug/ }).click();
  // titre valide → déverrouillé → envoi → sans jeton en CI : 503 affiché proprement
  await titre.fill('La roue reste bloquée');
  const bouton = page.getByRole('button', { name: /Envoyer le signalement/ });
  await expect(bouton).toBeEnabled();
  await bouton.click();
  await expect(page.locator('.error')).toContainText('Signalement indisponible');
});

test('rapport : capture jointe avec aperçu et retrait', async ({ page }) => {
  await register(page, `cap-${Date.now().toString(36)}`);
  await page.goto('/bugs');
  // « joindre » : input file caché piloté par le bouton — on charge une vraie image
  await page.locator('input[type=file]').setInputFiles({
    name: 'capture.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex'),
  });
  await expect(page.locator('.bug-apercu')).toBeVisible();
  await page.getByRole('button', { name: 'retirer' }).click();
  await expect(page.locator('.bug-apercu')).toHaveCount(0);
});
```

- [ ] **Step 2: Rouge** — `npx playwright test tests/e2e/bugs.spec.ts` → FAIL (404 sur `/bugs`).

- [ ] **Step 3: Page serveur** — create `app/bugs/page.tsx` :

```tsx
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import BugReportClient from '@/components/BugReportClient';

export const metadata = { title: 'Rapporter un bug — What Shall We Play?' };

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return (
    <main className="page bugs-page">
      <BugReportClient pseudo={user.pseudo} />
    </main>
  );
}
```

- [ ] **Step 4: Le client** — create `components/BugReportClient.tsx` :

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import pkg from '../package.json';

// Rapporter un bug : un formulaire simple, le contexte technique rassemblé
// automatiquement (bloc « Informations envoyées » = transparence totale avant
// l'envoi), l'issue ouverte par le serveur. Pas de capture automatique (choix
// v3.4) : l'utilisateur joint la sienne s'il le veut. L'écran succès est un
// ÉTAT (pas une route) : un refresh remet un formulaire vierge, ne reposte pas.

type TypeSignalement = 'bug' | 'amelioration';
type Infos = { appareil: string; navigateur: string; ecran: string; langue: string; installation: string };

interface NavigatorUAData {
  platform: string;
  brands?: { brand: string; version: string }[];
  getHighEntropyValues?: (hints: string[]) => Promise<{ model?: string; platformVersion?: string }>;
}

async function infosAppareil(): Promise<Infos> {
  const ecran = `${window.screen.width} × ${window.screen.height} @${window.devicePixelRatio}x`;
  const langue = navigator.language || 'fr';
  const installe = window.matchMedia('(display-mode: standalone)').matches
    || (navigator as unknown as { standalone?: boolean }).standalone === true;
  const uad = (navigator as unknown as { userAgentData?: NavigatorUAData }).userAgentData;
  let appareil = 'inconnu';
  let navigateur = 'inconnu';
  if (uad) {
    try {
      const h = (await uad.getHighEntropyValues?.(['model', 'platformVersion'])) ?? {};
      const os = h.platformVersion ? `${uad.platform} ${h.platformVersion.split('.')[0]}` : uad.platform;
      appareil = h.model ? `${h.model} · ${os}` : os;
    } catch { appareil = uad.platform; }
    const chrome = uad.brands?.find((b) => b.brand !== 'Chromium' && !/Not.?A.Brand/i.test(b.brand));
    navigateur = chrome ? `${chrome.brand.replace('Google ', '')} ${chrome.version.split('.')[0]}` : 'Chromium';
  } else {
    // Apple ne livre pas userAgentData : appareil et Safari depuis l'UA.
    const ua = navigator.userAgent;
    const ios = ua.match(/OS (\d+[_\d]*)/);
    if (/iPhone/.test(ua)) appareil = ios ? `iPhone · iOS ${ios[1].replace(/_/g, '.')}` : 'iPhone';
    else if (/iPad/.test(ua)) appareil = ios ? `iPad · iPadOS ${ios[1].replace(/_/g, '.')}` : 'iPad';
    else if (/Macintosh/.test(ua)) appareil = 'Mac';
    const saf = ua.match(/Version\/([\d.]+)/);
    if (saf) navigateur = `Safari ${saf[1].split('.')[0]}`;
  }
  return { appareil, navigateur, ecran, langue, installation: installe ? 'installée' : 'navigateur' };
}

export default function BugReportClient({ pseudo }: { pseudo: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const fileRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<TypeSignalement>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [capture, setCapture] = useState<File | null>(null);
  const [apercuUrl, setApercuUrl] = useState<string | null>(null);
  const [device, setDevice] = useState<Infos | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [succes, setSucces] = useState<{ url: string; numero: number } | null>(null);

  useEffect(() => { infosAppareil().then(setDevice).catch(() => setDevice(null)); }, []);
  useEffect(() => () => { if (apercuUrl) URL.revokeObjectURL(apercuUrl); }, [apercuUrl]);

  const titreOk = title.trim().length >= 3 && title.trim().length <= 120;
  const descOk = description.trim().length >= 10 && description.trim().length <= 4000;
  const pret = titreOk && descOk && !envoi && !succes;
  const pageOrigine = params.get('depuis') || '/bugs';

  function choisirCapture(f: File | null) {
    if (apercuUrl) URL.revokeObjectURL(apercuUrl);
    setCapture(f);
    setApercuUrl(f ? URL.createObjectURL(f) : null);
  }

  async function envoyer() {
    if (!pret) return;
    setEnvoi(true); setError(null);
    const form = new FormData();
    form.set('title', title);
    form.set('type', type);
    form.set('description', description);
    form.set('page', pageOrigine);
    form.set('device', JSON.stringify(device ?? {}));
    if (capture) form.set('capture', capture);
    try {
      const res = await fetch('/api/bugs', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Impossible d\u2019envoyer le signalement'); setEnvoi(false); return; }
      setSucces({ url: data.issueUrl, numero: data.issueNumber });
      navigator.vibrate?.([50, 30, 50]);
      router.refresh();
    } catch {
      setError('Réseau indisponible — ton signalement n\u2019est pas perdu, réessaie');
      setEnvoi(false);
    }
  }

  if (succes) {
    return (
      <div className="bug-succes">
        <div className="bug-rond" aria-hidden="true">✓</div>
        <h3>Merci, c\u2019est signalé !</h3>
        <p>Ton rapport est parti sur GitHub : <b>issue #{succes.numero} ouverte</b>. Suis son avancement directement là-bas.</p>
        <a className="bug-lien" href={succes.url} target="_blank" rel="noopener noreferrer">{succes.url.replace('https://github.com/', 'github.com/')} →</a>
        <button type="button" className="bug-annuler" onClick={() => router.push('/etagere')}>Revenir à l\u2019étagère</button>
      </div>
    );
  }

  return (
    <>
      <p className="bug-intro">Dis-nous ce qui s\u2019est passé — on reçoit tout le contexte technique tout seul.</p>
      <div className="bug-field">
        <label htmlFor="bug-titre">TITRE</label>
        <input id="bug-titre" type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120}
               placeholder="Ce qui ne va pas, en une phrase" aria-describedby="bug-titre-aide" />
        <span className="bug-aide" id="bug-titre-aide">{title.trim().length}/120</span>
      </div>
      <div className="bug-field" role="radiogroup" aria-label="Type de signalement">
        <label>TYPE</label>
        <div className="bug-types">
          <button type="button" className={'bug-type' + (type === 'bug' ? ' on' : '')} aria-pressed={type === 'bug'} onClick={() => setType('bug')}>
            <span className="t" aria-hidden="true">🐛</span>Bug
          </button>
          <button type="button" className={'bug-type amelio' + (type === 'amelioration' ? ' on' : '')} aria-pressed={type === 'amelioration'} onClick={() => setType('amelioration')}>
            <span className="t" aria-hidden="true">✨</span>Amélioration
          </button>
        </div>
      </div>
      <div className="bug-field">
        <label htmlFor="bug-desc">DESCRIPTION</label>
        <textarea id="bug-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000}
                  placeholder="Ce que tu as fait, ce qui s\u2019est passé, ce que tu attendais…" />
        <span className="bug-aide">{description.trim().length}/4000</span>
      </div>
      <div className="bug-field">
        <label>CAPTURE (OPTIONNELLE)</label>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden
               onChange={(e) => choisirCapture(e.target.files?.[0] ?? null)} />
        {!capture ? (
          <button type="button" className="bug-drop" onClick={() => fileRef.current?.click()}>📷 Joindre une capture depuis ta galerie</button>
        ) : (
          <div className="bug-apercu">
            <span className="mini">{apercuUrl ? <img src={apercuUrl} alt="" /> : '🖼️'}</span>
            <div><b>{capture.name}</b><span>{(capture.size / 1024).toFixed(0)} Ko — servie par ton serveur, URL à jeton</span></div>
            <button type="button" className="retirer" onClick={() => choisirCapture(null)}>retirer</button>
          </div>
        )}
      </div>
      <details className="bug-infos" open>
        <summary>🔍 Informations envoyées avec le rapport</summary>
        <ul>
          <li>Version de l\u2019app <b>v{pkg.version}</b></li>
          <li>Page d\u2019origine <b>{pageOrigine}</b></li>
          <li>Appareil <b>{device ? `${device.appareil} · ${device.navigateur}` : '…'}</b></li>
          <li>Écran <b>{device?.ecran ?? '…'}</b></li>
          <li>Langue · installation <b>{device ? `${device.langue} · ${device.installation}` : '…'}</b></li>
          <li>Signalé par <b>{pseudo}</b></li>
        </ul>
      </details>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="button" className="btn-copper" disabled={!pret} onClick={envoyer}>
        {envoi ? 'Envoi…' : type === 'bug' ? 'Envoyer le signalement' : 'Proposer l\u2019amélioration'}
      </button>
      <button type="button" className="bug-annuler" onClick={() => router.back()}>Annuler — revenir en arrière</button>
    </>
  );
}
```

- [ ] **Step 5: CSS** — append à `app/globals.css` :

```css
/* ===== v3.4 — rapporter un bug ===== */
.bug-intro { color: var(--doux-clair); font-size: 13.5px; line-height: 1.5; margin: 4px 0 16px; }
.bug-field { margin-bottom: 15px; }
.bug-field > label { display: block; font-size: 11px; letter-spacing: .12em; color: var(--doux); font-weight: 700; margin-bottom: 7px; }
.bug-field input[type="text"], .bug-field textarea { width: 100%; background: var(--surface); border: 1px solid color-mix(in srgb, var(--doux) 40%, transparent); border-radius: 12px; color: var(--creme); font: inherit; font-size: 16px; padding: 11px 13px; outline: none; }
.bug-field input:focus, .bug-field textarea:focus { border-color: var(--cuivre); }
.bug-field textarea { min-height: 118px; resize: none; line-height: 1.5; }
.bug-aide { display: block; text-align: right; font-size: 11px; color: var(--doux); margin-top: 4px; }
.bug-types { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
.bug-type { background: var(--surface); border: 1.5px solid color-mix(in srgb, var(--doux) 40%, transparent); border-radius: 13px; padding: 12px 10px; text-align: center; cursor: pointer; font: inherit; font-size: 13.5px; color: var(--doux-clair); }
.bug-type .t { font-size: 21px; display: block; margin-bottom: 4px; }
.bug-type.on { border-color: var(--cuivre); color: var(--creme); background: color-mix(in srgb, var(--cuivre) 14%, transparent); font-weight: 600; }
.bug-type.amelio.on { border-color: var(--vert); background: color-mix(in srgb, var(--vert) 14%, transparent); }
.bug-drop { width: 100%; border: 1.5px dashed color-mix(in srgb, var(--doux) 55%, transparent); border-radius: 13px; background: none; color: var(--doux-clair); font: inherit; font-size: 13.5px; padding: 15px 12px; cursor: pointer; }
.bug-drop:hover { border-color: var(--cuivre); color: var(--creme); }
.bug-apercu { display: flex; align-items: center; gap: 10px; background: var(--surface); border-radius: 12px; padding: 9px 11px; }
.bug-apercu .mini { width: 40px; height: 40px; border-radius: 8px; overflow: hidden; background: color-mix(in srgb, var(--doux) 30%, transparent); display: grid; place-items: center; font-size: 17px; flex: none; }
.bug-apercu .mini img { width: 100%; height: 100%; object-fit: cover; }
.bug-apercu b { display: block; font-size: 12.5px; overflow-wrap: anywhere; }
.bug-apercu div span { color: var(--doux-clair); font-size: 11.5px; }
.bug-apercu .retirer { margin-left: auto; color: var(--cuivre); background: none; border: 0; font: inherit; font-size: 12px; cursor: pointer; }
.bug-infos { background: color-mix(in srgb, var(--surface) 60%, transparent); border: 1px solid color-mix(in srgb, var(--doux) 30%, transparent); border-radius: 12px; margin: 6px 0 16px; }
.bug-infos summary { cursor: pointer; list-style: none; padding: 11px 13px; font-size: 12.5px; color: var(--doux-clair); display: flex; align-items: center; gap: 8px; }
.bug-infos summary::-webkit-details-marker { display: none; }
.bug-infos summary::after { content: '▸'; margin-left: auto; transition: transform .18s; }
.bug-infos[open] summary::after { transform: rotate(90deg); }
.bug-infos ul { padding: 2px 15px 12px; list-style: none; }
.bug-infos li { font-size: 12px; color: var(--doux-clair); padding: 3.5px 0; display: flex; justify-content: space-between; gap: 10px; border-top: 1px dashed color-mix(in srgb, var(--doux) 25%, transparent); }
.bug-infos li:first-child { border-top: 0; }
.bug-infos li b { color: var(--creme); font-weight: 500; text-align: right; overflow-wrap: anywhere; }
.bugs-page .btn-copper { width: 100%; border-radius: 14px; font-size: 15.5px; padding: 14px; border: 0; cursor: pointer; font: inherit; font-weight: 700; background: var(--cuivre); color: #fff; }
.bugs-page .btn-copper:disabled { opacity: .45; cursor: not-allowed; }
.bug-annuler { display: block; width: 100%; background: none; border: 1px solid color-mix(in srgb, var(--doux) 45%, transparent); color: var(--doux-clair); border-radius: 14px; font: inherit; font-size: 13.5px; padding: 11px; cursor: pointer; text-align: center; margin-top: 9px; }
.bug-succes { text-align: center; padding-top: 120px; }
.bug-succes .bug-rond { width: 86px; height: 86px; border-radius: 50%; background: color-mix(in srgb, var(--vert) 18%, transparent); border: 2px solid var(--vert); display: grid; place-items: center; font-size: 38px; margin: 0 auto 18px; }
.bug-succes h3 { font-family: var(--font-display), sans-serif; font-size: 21px; margin-bottom: 8px; }
.bug-succes p { color: var(--doux-clair); font-size: 14px; line-height: 1.55; max-width: 300px; margin: 0 auto 22px; }
.bug-succes .bug-lien { display: inline-block; background: var(--surface); border: 1px solid color-mix(in srgb, var(--doux) 45%, transparent); border-radius: 11px; color: var(--cuivre); text-decoration: none; font-size: 13px; padding: 10px 16px; font-weight: 600; overflow-wrap: anywhere; }
.bug-succes .bug-annuler { margin-top: 22px; }
```

- [ ] **Step 6: Vert** — `npx playwright test tests/e2e/bugs.spec.ts` → PASS. Puis suites adjacentes (`npx playwright test tests/e2e/profil.spec.ts tests/e2e/etats-scores.spec.ts`) puis FULL `npx playwright test` + `npx tsc --noEmit`.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat(bugs): l'écran /bugs — formulaire, infos techniques transparentes, envoi et succès"`

---

### Task 6: Environnement VPS + version 3.4.0

**Files:**
- Modify: `docker-compose.yml` (bloc `environment`)
- Modify: `package.json` (`"version": "3.4.0"`)
- Modify: `CHANGELOG.md` (entrée 3.4.0)

**Interfaces:**
- Consumes: T1-T5 (tout est en place).
- Produces: les env `GITHUB_BUG_TOKEN` / `GITHUB_REPO` / `PUBLIC_URL` déclarées (vides par défaut — le VPS les remplira) ; version bump.

- [ ] **Step 1: docker-compose** — bloc environment devient :

```yaml
    environment:
      - BGG_TOKEN=${BGG_TOKEN:-}
      - GITHUB_BUG_TOKEN=${GITHUB_BUG_TOKEN:-}
      - GITHUB_REPO=${GITHUB_REPO:-}
      - PUBLIC_URL=${PUBLIC_URL:-}
      - TZ=Europe/Paris
```

- [ ] **Step 2: CHANGELOG** — entrée en tête (après l'introduction) :

```markdown
## [3.4.0] — 2026-10-02

### Ajouté
- **« Rapporter un bug »** depuis le menu utilisateur : titre, type (🐛 bug /
  ✨ amélioration), description, capture jointe optionnelle. Les infos
  techniques partent automatiquement (version, page d'origine, appareil,
  écran, langue, app installée) et le serveur ouvre l'issue GitHub avec son
  label — confirmation avec le lien vers l'issue.
- Quota de 3 signalements par joueur et par jour ; les envois en échec ne
  consomment pas le quota.
```

- [ ] **Step 3: Version + suites** — `package.json` → `"3.4.0"`. Puis TOUTES les suites de référence : `npx vitest run`, `npx playwright test`, `npx tsc --noEmit`, `npm run build` — tout vert avant de pousser.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "chore: v3.4.0"`

- [ ] **Step 5: Release (contrôleur)** — push, PR, deux runs CI verts, merge, tag `v3.4.0` après CI main verte, release GitHub Latest, vérifier `curl -s https://etagere.marc-suarez.fr/sw.js | grep -o "wsp-v[0-9.]*"` = `wsp-v3.4.0`. Puis **action utilisateur** : créer le jeton fin GitHub (dépôt seul, Issues: Read and write) et l'ajouter au `.env` du VPS à côté de `docker-compose.yml`.
