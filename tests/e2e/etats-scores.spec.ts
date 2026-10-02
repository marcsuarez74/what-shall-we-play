import { test, expect, Page } from '@playwright/test';
import { newGame, gameIdByTitle, nightIdOf, putOnShelf } from './helpers/shelf';

// v3.3 — la soirée a un ÉTAT visible : badge « En préparation » puis « En jeu »
// (bandeau vert, étagère gelée) ; la soirée terminée laisse place à la carte
// « Terminée ». Helper réutilisé par les tests scores/médailles (T7-T9).

/** Enregistre un compte (1 joueur) et crée la partie du soir. */
async function registerAndStart(page: Page, pseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const reg = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await reg;
  await page.getByRole('button', { name: 'Créer la partie' }).click();
}

test('étagère : badge En préparation, puis bandeau en jeu après la boîte', async ({ page }) => {
  await registerAndStart(page, `eta-${Date.now()}`);
  const g = await newGame(page, 'Cascadia', 'moyen');
  await putOnShelf(page, g);
  await page.goto('/etagere');
  await expect(page.locator('.badge-etat')).toContainText('En préparation');
  // valider puis lancer + sortir la boîte (flux tirage via API pour aller vite)
  await page.getByRole('button', { name: 'Valider ma sélection' }).click();
  await expect(page.locator('.pill-ok')).toContainText('✓ Validée');
  const nid = await nightIdOf(page);
  const draw = await page.request.post('/api/draw', { data: { nightId: nid, gameIds: [g] } });
  const { gameId } = await draw.json();
  const out = await page.request.post(`/api/nights/${nid}/box-out`, { data: { gameId } });
  expect(out.ok()).toBeTruthy();
  await page.goto('/etagere');
  await expect(page.locator('.badge-etat')).toContainText('En jeu');
  await expect(page.locator('.bandeau')).toContainText('Cascadia');
  // l'étagère est gelée : plus d'ajout, plus de validation
  await expect(page.getByRole('button', { name: /Ajouter des jeux/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Valider ma sélection' })).toHaveCount(0);
  // créateur : CTA vers le carnet des scores
  await expect(page.getByRole('link', { name: '🏁 Partie terminée' })).toBeVisible();
});
