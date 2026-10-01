import { test, expect } from '@playwright/test';
import { newGame, putOnShelf } from './helpers/shelf';

// v3.0.0 — plus de sélection : l'étagère EST le pool. Le tirage se lance depuis
// la barre fixe, sur TOUTES les boîtes (les filtres restent une vue de
// navigation) ; le glisser ne déclenche jamais la fiche.

async function registerAndStart(page: import('@playwright/test').Page, pseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const reg = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await reg;
  const nightDone = page.waitForResponse((r) => r.url().endsWith('/api/nights') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Créer la partie' }).click();
  const { nightId } = await (await nightDone).json() as { nightId: number }; // v3 : étagère vide à la création
  await page.waitForURL('/etagere');
  return nightId;
}

/** Jeux posés sur l'étagère de la soirée (le geste des joueurs, via l'API). */
async function peuplerEtagere(page: import('@playwright/test').Page, nightId: number, jeux: [string, string][]) {
  for (const [t, f] of jeux) await putOnShelf(page, await newGame(page, t, f), nightId);
  await page.goto('/etagere');
}

test('barre de lancement + validation visibles sans scroller (4 rangées)', async ({ page }) => {
  const nightId = await registerAndStart(page, `fix-${Date.now()}`);
  // 4 formats = 4 rangées : la page dépasse l'écran
  await peuplerEtagere(page, nightId, [['Alpha', 'grand'], ['Bravo', 'moyen'], ['Charlie', 'petit'], ['Delta', 'mini']]);
  await page.locator('.box').first().waitFor();

  // Le créateur valide sa sélection (solo → tout le monde est prêt), puis lance
  await page.getByRole('button', { name: 'Valider ma sélection' }).click();
  await expect(page.locator('.pret-line')).toContainText('Ta sélection est validée');

  // Sans aucun scroll : la zone d'action est entièrement dans le viewport
  const inView = await page.evaluate(() => {
    const r = document.querySelector('.cta-zone')!.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight && r.height > 0;
  });
  expect(inView).toBe(true);

  // Lancer le tirage · 4 = TOUTES les boîtes de l'étagère
  await page.getByRole('button', { name: 'Lancer le tirage · 4' }).click();
  await page.waitForURL(/\/tirage\//);
});

test('les filtres réduisent la vue, jamais le pool du tirage', async ({ page }) => {
  const nightId = await registerAndStart(page, `filtre-${Date.now()}`);
  await peuplerEtagere(page, nightId, [['Alpha', 'grand'], ['Bravo', 'moyen'], ['Charlie', 'petit'], ['Delta', 'mini']]);
  await page.locator('.box').first().waitFor();

  // Filtre par la recherche : une seule boîte visible
  await page.getByLabel('Rechercher un jeu').fill('Alpha');
  await expect(page.locator('.shelf-block .box')).toHaveCount(1);

  // Le lanceur compte quand même TOUTES les boîtes de l'étagère
  await expect(page.getByRole('button', { name: 'Lancer le tirage · 4' })).toBeVisible();
});
