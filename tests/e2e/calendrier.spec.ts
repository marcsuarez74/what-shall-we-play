import { test, expect, Page } from '@playwright/test';
import { passerBienvenue } from './helpers/inscription';

// v4.11.0 — « Ajouter à mon calendrier » : fichier .ics d'une partie programmée,
// réservé à ceux qui y jouent ; rien sur la partie du jour.

async function register(page: Page, pseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const reg = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await reg;
  await passerBienvenue(page);
}
const dansNJours = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };

test('calendrier : le lien télécharge un .ics valide, un étranger reçoit 404', async ({ browser }) => {
  const s = Date.now().toString(36);
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await register(a, `ca_${s}`);
  await register(b, `cb_${s}`);

  // Partie programmée dans 3 jours, 20:00, avec un titre.
  const date = dansNJours(3);
  const cree = await a.request.post('/api/nights', { data: { playedAt: date, startTime: '20:00', titre: 'Soirée Azul & co', playerIds: [] } });
  expect(cree.ok()).toBeTruthy();
  const { nightId } = await cree.json();

  await a.goto('/nights');
  const lien = a.locator('.planned-card').getByRole('link', { name: /Ajouter à mon calendrier/ });
  await expect(lien).toHaveAttribute('href', `/api/nights/${nightId}/ics`);

  const dl = await a.request.get(`/api/nights/${nightId}/ics`);
  expect(dl.status()).toBe(200);
  expect(dl.headers()['content-type']).toContain('text/calendar');
  expect(dl.headers()['content-disposition']).toContain('soiree-azul-co.ics');
  const ics = await dl.text();
  expect(ics).toContain('BEGIN:VCALENDAR');
  expect(ics).toContain('SUMMARY:Soirée Azul & co');
  expect(ics).toContain(`DTSTART:${date.replaceAll('-', '')}T200000`);
  expect(ics).toContain(`ca_${s}`);
  expect(ics).not.toContain('?k='); // jamais le lien d'invitation

  // Un compte qui ne joue pas cette partie : 404, comme une partie inconnue.
  expect((await b.request.get(`/api/nights/${nightId}/ics`)).status()).toBe(404);
  expect((await b.request.get('/api/nights/999999/ics')).status()).toBe(404);
});

test('calendrier : pas de .ics pour la partie du jour', async ({ browser }) => {
  const s = Date.now().toString(36);
  const a = await (await browser.newContext()).newPage();
  await register(a, `cj_${s}`);
  const cree = await a.request.post('/api/nights', { data: { playerIds: [] } });
  expect(cree.ok()).toBeTruthy();
  const { nightId } = await cree.json();
  expect((await a.request.get(`/api/nights/${nightId}/ics`)).status()).toBe(409);
});
