import { test, expect, Page } from '@playwright/test';
import { devenirAmis } from './helpers/amis';

// v4.14.1 — places max : complet → « Me mettre en attente » ; une place libérée promeut
// automatiquement le premier de la liste.

async function register(page: Page, pseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const reg = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await reg;
  await page.waitForURL('/etagere');
}
const dansNJours = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const idDe = async (p: Page) => ((await (await p.request.get('/api/me')).json()) as { id: number }).id;

test('liste d’attente : complet, mise en attente, promotion automatique', async ({ browser }) => {
  test.setTimeout(90_000);
  const s = Date.now().toString(36);
  const [a, b, c] = await Promise.all([1, 2, 3].map(async () => (await browser.newContext()).newPage()));
  await register(a, `la_${s}`); await register(b, `lb_${s}`); await register(c, `lc_${s}`);
  await devenirAmis(a, b, c);

  // 2 places : l'hôte + 1.
  const r = await a.request.post('/api/nights', {
    data: { playedAt: dansNJours(3), startTime: '20:00', titre: 'Petite table', placesMax: 2, playerIds: [await idDe(b), await idDe(c)] },
  });
  expect(r.ok()).toBeTruthy();
  const { nightId: nid } = await r.json() as { nightId: number };
  expect((await a.request.post('/api/nights', { data: { playedAt: dansNJours(3), placesMax: 1, playerIds: [] } })).status()).toBe(400);

  // B prend la dernière place.
  await b.goto('/nights');
  await b.locator('.rsvp', { hasText: 'Petite table' }).getByRole('button', { name: '✓ Dispo', exact: true }).click();
  await expect(b.locator('.planned-card', { hasText: 'Petite table' })).toBeVisible();

  // C trouve la partie complète et se met en attente.
  await c.goto('/nights');
  const carteC = c.locator('.rsvp', { hasText: 'Petite table' });
  await expect(carteC).toContainText('Complet (2/2)');
  await carteC.getByRole('button', { name: 'Me mettre en attente' }).click();
  await expect(carteC).toContainText('Tu es 1ᵉʳ en liste d’attente');

  // L'hôte voit le décompte.
  await a.goto('/nights');
  await expect(a.locator('.planned-card', { hasText: 'Petite table' }).locator('.decompte')).toContainText('2/2 · complet');
  await expect(a.locator('.planned-card', { hasText: 'Petite table' }).locator('.decompte')).toContainText('1 en attente');

  // B se désiste → C joue automatiquement.
  expect((await b.request.post(`/api/nights/${nid}/invitation`, { data: { reponse: 'absent' } })).ok()).toBeTruthy();
  await c.reload();
  await expect(c.locator('.planned-card', { hasText: 'Petite table' })).toBeVisible();
  await expect(c.locator('.rsvp', { hasText: 'Petite table' })).toHaveCount(0);
});
