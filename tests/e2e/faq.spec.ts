import { test, expect } from '@playwright/test';

test('la FAQ est publique, avec accordéons fonctionnels', async ({ page }) => {
  await page.goto('/faq');
  await expect(page.getByRole('heading', { name: 'FAQ' })).toBeVisible();
  // 2 accordéons ouverts par défaut, 10 fermés
  await expect(page.locator('details.faq[open]')).toHaveCount(2);
  await expect(page.locator('details.faq')).toHaveCount(12);
  // ouverture/fermeture
  const q = page.locator('details.faq summary').first();
  await q.click();
  // un clic sur le 1er (ouvert) le ferme → 1 ouvert restant
  await expect(page.locator('details.faq[open]')).toHaveCount(1);
});

test('le visiteur non connecté voit la FAQ sans redirect', async ({ browser }) => {
  const ctx = await browser.newContext(); // aucun cookie de session
  const page = await ctx.newPage();
  await page.goto('/faq');
  await expect(page).not.toHaveURL(/login/);
  await expect(page.getByRole('heading', { name: 'FAQ' })).toBeVisible();
});
