import { test, expect, type Page } from '@playwright/test';
import { newGame, putOnShelf } from './helpers/shelf';

const hier = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE');
const demain = new Date(Date.now() + 86400000).toLocaleDateString('sv-SE');

async function register(page: Page, pseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const done = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await done;
  await page.waitForURL('/etagere');
}

async function monId(page: Page): Promise<number> {
  return ((await (await page.request.get('/api/me')).json()) as { id: number }).id;
}

/** Compte + jeu (helpers API), nuit via API, étagère, tirage, boîte, fin AVEC scores. */
async function partieTerminee(page: Page, pseudo: string, score?: number): Promise<{ nightId: number; gameId: number }> {
  await register(page, pseudo);
  const gameId = await newGame(page, `Cascadia-${pseudo}`, 'grand');
  const { nightId } = await (await page.request.post('/api/nights', { data: { playerIds: [] } })).json() as { nightId: number };
  await putOnShelf(page, gameId, nightId);
  await page.request.post('/api/draw', { data: { nightId, gameIds: [gameId] } });
  await page.request.post(`/api/nights/${nightId}/box-out`, { data: { gameId } });
  // La route /end attend le wrapper { scores } — un record nu serait ignoré.
  // monId APRÈS le register : évalué avant l'appel (arguments JS), /api/me répond
  // 401 et la clé de score vaut "undefined" → Number(...) = NaN → 400 « Score
  // invalide », la nuit ne se termine jamais.
  const scores = score === undefined ? {} : { [await monId(page)]: score };
  await page.request.post(`/api/nights/${nightId}/end`, { data: { scores } });
  return { nightId, gameId };
}

test('corriger un score → le podium et la page se mettent à jour', async ({ page }) => {
  const s = Date.now().toString(36);
  const { nightId } = await partieTerminee(page, `cor-${s}`, 78);
  await page.goto(`/nights/${nightId}`);
  await page.getByRole('button', { name: 'Corriger cette partie' }).click();
  await page.getByLabel(`Score de ${`cor-${s}`}`).fill('82');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.pod1 .sc')).toContainText('82');
});

test('changer le jeu → alerte, puis verdicts réinitialisés (zéro)', async ({ page }) => {
  const s = Date.now().toString(36);
  const { nightId } = await partieTerminee(page, `ver-${s}`, 20);
  await newGame(page, `Everdell-${s}`, 'moyen'); // le second jeu à sélectionner
  await page.request.post(`/api/nights/${nightId}/verdict`, { data: { verdict: 'adore' } });
  await page.goto(`/nights/${nightId}`);
  await page.getByRole('button', { name: 'Corriger cette partie' }).click();
  await page.getByLabel('Jeu joué').selectOption({ label: `Everdell-${s}` });
  // p[role="alert"] : le route announcer de Next (div#__next-route-announcer__,
  // role="alert" aussi) fausse le getByRole('alert') nu — strict mode violation.
  await expect(page.locator('p[role="alert"]')).toContainText('réinitialise les verdicts');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  // la modale de suppression sert de surface d'assertion : compteurs à zéro
  await page.getByRole('button', { name: '🗑️ Supprimer cette partie' }).click();
  await expect(page.getByRole('dialog')).toContainText('0 😍 · 0 🙂 · 0 😐');
  await page.getByRole('button', { name: 'Garder' }).click();
});

test('supprimer avec confirmation → redirection, nuit 404', async ({ page }) => {
  const s = Date.now().toString(36);
  const { nightId } = await partieTerminee(page, `sup-${s}`, 55);
  await page.goto(`/nights/${nightId}`);
  await page.getByRole('button', { name: '🗑️ Supprimer cette partie' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click();
  await page.waitForURL('**/nights');
  const res = await page.goto(`/nights/${nightId}`);
  expect(res!.status()).toBe(404);
});

test('non-membre : page 404 et API 404 (PATCH comme DELETE)', async ({ browser }) => {
  const s = Date.now().toString(36);
  const page = await (await browser.newContext()).newPage();
  const { nightId } = await partieTerminee(page, `nm-${s}`);
  const autre = await (await browser.newContext()).newPage();
  await register(autre, `nm-autre-${s}`);
  expect((await autre.goto(`/nights/${nightId}`))!.status()).toBe(404);
  const patch = await autre.request.patch(`/api/nights/${nightId}`, { data: { playedAt: hier } });
  expect(patch.status()).toBe(404);
  const del = await autre.request.delete(`/api/nights/${nightId}`);
  expect(del.status()).toBe(404);
});

test('date future → message d\'erreur affiché, rien n\'enregistré', async ({ page }) => {
  const s = Date.now().toString(36);
  const { nightId } = await partieTerminee(page, `df-${s}`);
  await page.goto(`/nights/${nightId}`);
  await page.getByRole('button', { name: 'Corriger cette partie' }).click();
  await page.getByLabel('Date de la partie').fill(demain);
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('p[role="alert"]')).toContainText('Date invalide'); // clé existante réutilisée
});
