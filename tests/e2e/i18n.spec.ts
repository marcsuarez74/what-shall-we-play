import { test, expect } from '@playwright/test';

// Smoke i18n : le cookie wsp_lang pilote toute l'UI (langue + <html lang>) ;
// sans cookie ou avec une valeur invalide, tout reste en FR (défaut) — c'est ce
// qui garde les specs E2E existantes vertes sans retouche.

test('EN : le formulaire d inscription est en anglais', async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: 'wsp_lang', value: 'en', url: 'http://localhost:3000' }]);
  const page = await ctx.newPage();
  await page.goto('/register');
  await expect(page.getByRole('button', { name: 'Create my account' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await ctx.close();
});

test('langue invalide (wsp_lang=xx) → repli FR, jamais de crash', async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: 'wsp_lang', value: 'xx', url: 'http://localhost:3000' }]);
  const page = await ctx.newPage();
  await page.goto('/register');
  await expect(page.getByRole('button', { name: 'Créer mon compte' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await ctx.close();
});

test('sans cookie : tout reste en français', async ({ page }) => {
  await page.goto('/register');
  await expect(page.getByRole('button', { name: 'Créer mon compte' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
});
