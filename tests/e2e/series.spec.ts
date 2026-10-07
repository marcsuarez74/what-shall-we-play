import { test, expect, Page } from '@playwright/test';
import { devenirAmis } from './helpers/amis';

// v4.14.0 — parties récurrentes : « Répéter » crée 4 dates, l'invité répond « Dispo à
// toutes », un conflit d'horaire s'affiche sans bloquer, l'arrêt liste ce qui part.

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

test('série : Répéter → 4 dates, Dispo à toutes, conflit, arrêt', async ({ browser }) => {
  test.setTimeout(90_000);
  const s = Date.now().toString(36);
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await register(a, `ra_${s}`);
  await register(b, `rb_${s}`);
  await devenirAmis(a, b);

  // L'hôte programme « Jeudi jeux » et coche Répéter (chaque semaine).
  await a.goto('/nights');
  await a.getByRole('button', { name: /Nouvelle partie/ }).click();
  await a.locator('.bottom-sheet .plan-titre-field input[type="text"]').fill('Jeudi jeux');
  await a.getByLabel('Date', { exact: true }).fill(dansNJours(2));
  await a.getByLabel(/^Heure/).fill('20:00');
  await a.getByLabel('🔁 Répéter').check();
  await expect(a.getByRole('group', { name: 'Fréquence' }).getByRole('button', { name: 'Chaque semaine' })).toHaveAttribute('aria-pressed', 'true');
  await a.locator('.player-list label', { hasText: `rb_${s}` }).locator('input').check();
  await a.getByRole('button', { name: 'Programmer et inviter' }).click();
  const carteA = a.getByRole('region', { name: 'Séries' }).locator('.serie-card');
  await expect(carteA).toContainText('🔁 Jeudi jeux');
  await expect(carteA.locator('.serie-date')).toHaveCount(4);

  // L'invité voit la série (pas 4 invitations séparées) et répond Dispo à toutes.
  await b.goto('/nights');
  const carteB = b.getByRole('region', { name: 'Séries' }).locator('.serie-card');
  await expect(carteB).toContainText(`Organisée par ra_${s}`);
  await expect(b.locator('.rsvp:not(.sondage-card)')).toHaveCount(0);
  await carteB.getByRole('button', { name: 'Dispo à toutes' }).click();
  await expect(carteB.locator('.btn-dispo-date[aria-pressed="true"]')).toHaveCount(4);

  // Conflit : l'invité programme une autre partie le jour de la 1re date, 1 h plus tard.
  const r = await b.request.post('/api/nights', { data: { playedAt: dansNJours(2), startTime: '21:00', titre: 'Soirée Léa', playerIds: [] } });
  expect(r.ok()).toBeTruthy();
  await b.reload();
  await expect(carteB.locator('.conflit')).toContainText('Tu joues déjà ce jour-là : « Soirée Léa »');

  // L'hôte arrête la série : la confirmation liste ce qui part, puis la carte disparaît.
  await a.reload();
  await carteA.getByRole('button', { name: 'Arrêter la série' }).click();
  await expect(a.getByRole('group', { name: 'Arrêter la série ?' })).toContainText('4 dates à venir sans étagère seront supprimées');
  await a.getByRole('button', { name: 'Arrêter', exact: true }).click();
  await expect(a.getByRole('region', { name: 'Séries' })).toHaveCount(0);
});
