import { test, expect, Page } from '@playwright/test';
import { devenirAmis } from './helpers/amis';

// v4.10.0 — formulaire Nouvelle partie unifié (Quand ?) et sondage de dates :
// proposer deux soirs → l'invité coche → l'organisateur retient → partie programmée.

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

test('sondage : deux soirs proposés, l’invité coche, l’organisateur retient', async ({ browser }) => {
  test.setTimeout(90_000);
  const s = Date.now().toString(36);
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await register(a, `so_${s}`);
  await register(b, `sb_${s}`);
  await devenirAmis(a, b);

  // Étagère vide : « Nouvelle partie », Maintenant présélectionné.
  await a.reload();
  const quand = a.getByRole('group', { name: 'Quand ?' });
  await expect(quand.getByRole('button', { name: 'Maintenant' })).toHaveAttribute('aria-pressed', 'true');
  await expect(a.getByRole('button', { name: 'Créer la partie' })).toBeVisible();
  await quand.getByRole('button', { name: 'Plusieurs dates' }).click();
  await a.getByLabel('Date 1').fill(dansNJours(3));
  await a.getByLabel('Date 2').fill(dansNJours(4));
  await a.locator('.player-list label', { hasText: `sb_${s}` }).locator('input').check();
  await expect(a.getByText('2 dates proposées à 1 personne.')).toBeVisible();
  await a.getByRole('button', { name: 'Envoyer le sondage' }).click();
  await a.waitForURL('/nights');
  await expect(a.getByRole('region', { name: 'Sondages' })).toContainText('0 / 1 ont répondu');

  // L'invité coche le premier soir.
  await b.goto('/nights');
  await expect(b.getByLabel('1 invitation sans réponse')).toBeVisible();
  const carte = b.locator('.sondage-card');
  await expect(carte).toContainText('demande tes dispos');
  const premier = carte.locator('.vote-date').first().getByRole('button');
  await premier.click();
  await expect(premier).toHaveAttribute('aria-pressed', 'true');
  await expect(carte).toContainText('Réponse enregistrée');

  // L'organisateur retient le soir pressenti (coché d'avance) : partie programmée, invité joueur.
  await a.reload();
  const sondage = a.getByRole('region', { name: 'Sondages' });
  await expect(sondage).toContainText('1 / 1 ont répondu');
  await sondage.getByRole('button', { name: 'Programmer la partie' }).click();
  await expect(a.getByRole('region', { name: 'Sondages' })).toHaveCount(0);
  await expect(a.locator('.planned-card')).toContainText(`sb_${s}`);
  await expect(a.locator('.planned-card .decompte')).toContainText('1 dispo');
});
