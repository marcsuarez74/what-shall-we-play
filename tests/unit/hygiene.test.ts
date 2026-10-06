import { describe, expect, it, vi } from 'vitest';
import pkg from '../../package.json';

// v4.7.4 — lot D de l'audit : service worker servi par une route (version injectée,
// plus de fichier réécrit au build), sonde de santé, inscription robuste au corps invalide.
vi.mock('@/lib/i18n/server', () => ({ getLang: async () => 'fr' }));

describe('hygiène', () => {
  it('/sw.js porte la version de package.json et le cache séparé des pochettes', async () => {
    const { GET } = await import('@/app/sw.js/route');
    const res = GET();
    expect(res.headers.get('Content-Type')).toContain('javascript');
    const js = await res.text();
    expect(js).toContain(`const CACHE = 'wsp-v${pkg.version}'`);
    expect(js).toContain("const COVERS = 'wsp-covers'");
    expect(() => new Function(js)).not.toThrow(); // JavaScript valide
  });

  it('/api/sante répond ok quand la base est lisible', async () => {
    const { GET } = await import('@/app/api/sante/route');
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  it('/api/auth/register : corps invalide → 400, plus de 500', async () => {
    const { POST } = await import('@/app/api/auth/register/route');
    const res = await POST(new Request('http://x/api/auth/register', { method: 'POST', body: 'pas du json' }));
    expect(res.status).toBe(400);
  });
});
