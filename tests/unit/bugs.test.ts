import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerUser } from '@/lib/auth';
import { createBugReport, corpsIssue, validerSignalement } from '@/lib/bugs';
import { getDb } from '@/lib/db';
import { saveBugCapture } from '@/lib/storage';
import { GET } from '@/app/api/bugs/capture/[name]/route';
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
const erreurDe = async (r: Promise<Awaited<ReturnType<typeof createBugReport>>>): Promise<{ error: string; status: number }> => {
  const res = await r;
  if (!('error' in res)) throw new Error(`attendu en erreur, reçu ok : ${JSON.stringify(res)}`);
  return res;
};

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
    const r = await createBugReport({ ...input(marc, 'bug-marc'), captureName: '3f0f7c1e-1c2b-4a5d-9e8f-0a1b2c3d4e5f.png' });
    expect(r).toEqual({ ok: true, issueUrl: 'https://github.com/org/repo-test/issues/14', issueNumber: 14 });
    const [url, opts] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/repos/org/repo-test/issues');
    expect(JSON.parse(String(opts.body)).title).toBe('[Bug] La roue reste bloquée');
    expect(JSON.parse(String(opts.body)).labels).toEqual(['bug']);
    const row = getDb().prepare('SELECT issue_url, type, capture_name FROM bug_reports WHERE user_id = ?').get(marc) as { issue_url: string; type: string; capture_name: string };
    expect(row.issue_url).toBe('https://github.com/org/repo-test/issues/14');
    expect(row.type).toBe('bug');
    expect(row.capture_name).toBe('3f0f7c1e-1c2b-4a5d-9e8f-0a1b2c3d4e5f.png');
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
    for (let i = 0; i < 3; i++) expect(await createBugReport(input(lea, 'bug-lea'))).toMatchObject({ ok: true });
    expect((await erreurDe(createBugReport(input(lea, 'bug-lea')))).status).toBe(429);
    // échec GitHub : pas d'insertion → le compte d'un autre joueur part de zéro
    const zoe = uid('bug-zoe');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"boom"}', { status: 500 })));
    expect((await erreurDe(createBugReport(input(zoe, 'bug-zoe')))).status).toBe(502);
    expect((getDb().prepare('SELECT COUNT(*) AS t FROM bug_reports WHERE user_id = ?').get(zoe) as { t: number }).t).toBe(0);
  });

  it('token absent → 503 ; réseau en échec → 502', async () => {
    vi.stubEnv('GITHUB_BUG_TOKEN', '');
    const r = await createBugReport(input(uid('bug-sans'), 'bug-sans'));
    expect(r).toEqual({ error: 'Signalement indisponible pour le moment — réessaie plus tard', status: 503 });
    vi.stubEnv('GITHUB_BUG_TOKEN', 'jeton-test');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('réseau'); }));
    expect((await erreurDe(createBugReport(input(uid('bug-off'), 'bug-off')))).status).toBe(502);
    // corps 2xx illisible : le parse doit être sous le try → 502, pas d'exception non gérée
    vi.stubGlobal('fetch', vi.fn(async () => new Response('pas du json', { status: 201 })));
    expect((await erreurDe(createBugReport(input(uid('bug-json'), 'bug-json')))).status).toBe(502);
  });
});

describe('GET /api/bugs/capture/[name]', () => {
  it('sert le fichier (200, Content-Type image) et 404 pour un nom inconnu/mauvais', async () => {
    const name = saveBugCapture(Buffer.from('png-fake'), 'png');
    const ok = await GET(new Request('https://x/y'), { params: Promise.resolve({ name }) });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Content-Type')).toBe('image/png');
    expect(ok.headers.get('Cache-Control')).toContain('immutable');
    const inconnu = await GET(new Request('https://x/y'), { params: Promise.resolve({ name: '00000000-0000-4000-8000-000000000000.png' }) });
    expect(inconnu.status).toBe(404);
    const traversée = await GET(new Request('https://x/y'), { params: Promise.resolve({ name: '../../etc/passwd.png' }) });
    expect(traversée.status).toBe(404);
  });
});
