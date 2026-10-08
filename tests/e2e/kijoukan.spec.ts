import { test, expect, Page } from '@playwright/test';
import { devenirAmis } from './helpers/amis';
import { passerBienvenue } from './helpers/inscription';

// v4.16.0 — Kijoukan : ma semaine type au profil, carte de chaleur du cercle, meilleur
// créneau → sondage prérempli (le cercle coché, les 3 prochaines dates du créneau).

async function register(page: Page, pseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const reg = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await reg;
  await passerBienvenue(page);
}
const idDe = async (p: Page) => ((await (await p.request.get('/api/me')).json()) as { id: number }).id;

test('Kijoukan : semaine type, carte du cercle, proposer une partie', async ({ browser }) => {
  test.setTimeout(90_000);
  const s = Date.now().toString(36);
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await register(a, `ka_${s}`);
  await register(b, `kb_${s}`);
  await devenirAmis(a, b);
  const c = await a.request.post('/api/cercles', { data: { nom: 'Joueurs du jeudi' } });
  const { id: cid } = await c.json() as { id: number };
  expect((await a.request.post(`/api/cercles/${cid}/membres`, { data: { userId: await idDe(b) } })).ok()).toBeTruthy();

  // B coche « jeudi soir » au profil.
  await b.goto('/profil');
  const grilleB = b.getByRole('region', { name: 'Kijoukan · ma semaine type' });
  const enregistreB = b.waitForResponse((r) => r.url().endsWith('/api/me/kijoukan') && r.request().method() === 'PUT');
  await grilleB.getByRole('gridcell', { name: 'jeudi soir' }).click();
  expect((await enregistreB).ok()).toBeTruthy();
  await expect(grilleB.getByRole('gridcell', { name: 'jeudi soir' })).toHaveAttribute('aria-pressed', 'true');
  expect((await b.request.put('/api/me/kijoukan', { data: { grille: 'abc' } })).status()).toBe(400);

  // A ouvre le cercle : 1 dispo jeudi soir ; il coche aussi → 2/2, meilleur créneau.
  await a.goto(`/amis/cercles/${cid}`);
  const carte = a.getByRole('region', { name: 'Kijoukan · qui joue quand ?' });
  await expect(carte.getByRole('gridcell', { name: 'jeudi soir' })).toHaveText('1');
  const enregistre = a.waitForResponse((r) => r.url().endsWith('/api/me/kijoukan') && r.request().method() === 'PUT');
  await carte.getByRole('gridcell', { name: 'jeudi soir' }).click();
  expect((await enregistre).ok()).toBeTruthy();
  await expect(carte.getByRole('gridcell', { name: 'jeudi soir' })).toHaveText('2');
  await expect(carte).toContainText(`jeudi soir : `);
  await a.reload();
  await expect(carte).toContainText('Meilleur créneau : jeudi soir (2/2)');

  // « Proposer une partie jeudi soir » → sondage prérempli : 3 jeudis à 20:00, B coché.
  await carte.getByRole('button', { name: 'Proposer une partie jeudi soir' }).click();
  await expect(a.getByRole('group', { name: 'Quand ?' }).getByRole('button', { name: 'Plusieurs dates' })).toHaveAttribute('aria-pressed', 'true');
  for (const n of [1, 2, 3]) {
    const v = await a.getByLabel(`Date ${n}`, { exact: true }).inputValue();
    expect(new Date(`${v}T12:00:00`).getDay()).toBe(4); // jeudi
    await expect(a.getByLabel(`Heure ${n} (facultative)`, { exact: true })).toHaveValue('20:00');
  }
  await expect(a.locator('.bottom-sheet .player-list label', { hasText: `kb_${s}` }).locator('input')).toBeChecked();
  const envoi = a.waitForResponse((r) => r.url().endsWith('/api/sondages') && r.request().method() === 'POST');
  await a.getByRole('button', { name: 'Envoyer le sondage' }).click();
  expect((await envoi).ok()).toBeTruthy();
  await a.goto('/nights');
  await expect(a.getByRole('region', { name: 'Sondages' })).toContainText('0 / 1 ont répondu');
});
