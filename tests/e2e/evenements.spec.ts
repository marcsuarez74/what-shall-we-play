import { test, expect, Page } from '@playwright/test';
import { devenirAmis } from './helpers/amis';
import { newGame, putOnShelf } from './helpers/shelf';
import { passerBienvenue } from './helpers/inscription';

// v4.15.0 — événements : sous-onglet, création avec participants, jeu au programme,
// partie démarrée dans l'événement (ses seuls joueurs), coche automatique, suppression.

async function register(page: Page, pseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const reg = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await reg;
  await passerBienvenue(page);
}

test('événement : création, programme, partie rattachée, coche automatique, suppression', async ({ browser }) => {
  test.setTimeout(120_000);
  const s = Date.now().toString(36);
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await register(a, `ea_${s}`);
  await register(b, `eb_${s}`);
  await devenirAmis(a, b);
  const gloom = await newGame(a, 'Gloomhaven', 'grand');

  // Parties › Événements › ＋ Nouvel événement (participant : B ; sans période).
  await a.goto('/nights');
  await a.getByRole('link', { name: /^Événements/ }).click();
  await a.waitForURL(/vue=evenements/);
  await expect(a.getByText('Aucun événement pour l’instant.')).toBeVisible();
  await a.getByRole('button', { name: '＋ Nouvel événement' }).click();
  const form = a.getByRole('dialog', { name: '＋ Nouvel événement' });
  await form.locator('.plan-titre-field input').first().fill('Marathon campagnes');
  await form.locator('.player-list label', { hasText: `eb_${s}` }).locator('input').check();
  await form.getByRole('button', { name: 'Créer l’événement' }).click();
  await a.waitForURL(/\/evenements\/\d+$/);
  await expect(a.locator('.evt-hero')).toContainText('Dates à définir');

  // Au programme : Gloomhaven (bottom-sheet de la ludothèque).
  await a.getByRole('button', { name: '＋ Ajouter un jeu' }).click();
  await a.getByRole('dialog', { name: 'Au programme : mes jeux' }).locator('label', { hasText: 'Gloomhaven' }).locator('input').check();
  await a.getByRole('dialog', { name: 'Au programme : mes jeux' }).getByRole('button', { name: 'Fermer' }).click();
  await expect(a.locator('.evt-jeux')).toContainText('Gloomhaven');
  await expect(a.locator('.evt-jeux li').first()).not.toHaveClass(/joue/);

  // ▶ Démarrer une partie dans l'événement : seule A joue (B ne reçoit rien).
  await a.getByRole('button', { name: '▶ Démarrer une partie dans l’événement' }).click();
  const creee = a.waitForResponse((r) => r.url().endsWith('/api/nights') && r.request().method() === 'POST');
  await a.getByRole('button', { name: 'Créer la partie' }).click();
  const { nightId } = await (await creee).json() as { nightId: number };
  await expect(a.locator('.serie-date')).toHaveCount(1);
  await expect(a.locator('.serie-date')).toContainText(`ea_${s}`);
  await expect(a.locator('.serie-date')).not.toContainText(`eb_${s}`);

  // La partie se termine sur Gloomhaven → coché tout seul.
  await putOnShelf(a, gloom, nightId);
  expect((await a.request.post(`/api/nights/${nightId}/box-out`, { data: { gameId: gloom } })).ok()).toBeTruthy();
  expect((await a.request.post(`/api/nights/${nightId}/end`, { data: {} })).ok()).toBeTruthy();
  await a.reload();
  await expect(a.locator('.evt-jeux li').first()).toHaveClass(/joue/);
  await expect(a.locator('.evt-page')).toContainText('1 / 1 joués');

  // B (participante) voit l'événement, sans bouton de suppression.
  await b.goto('/nights?vue=evenements');
  await b.getByRole('link', { name: /Marathon campagnes/ }).click();
  await expect(b.locator('.evt-hero')).toContainText(`Organisé par ea_${s}`);
  await expect(b.getByRole('button', { name: 'Supprimer l’événement' })).toHaveCount(0);

  // A supprime (confirmé) : la partie reste dans l'historique.
  await a.getByRole('button', { name: 'Supprimer l’événement' }).click();
  await a.getByRole('button', { name: /Sûr \? Les 1 partie/ }).click();
  await a.waitForURL(/vue=evenements/);
  await expect(a.getByText('Aucun événement pour l’instant.')).toBeVisible();
  expect((await a.request.get(`/nights/${nightId}`)).ok()).toBeTruthy();
});
