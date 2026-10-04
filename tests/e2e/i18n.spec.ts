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

// Review Focus n°4 : la route lit le cookie et renvoie l'erreur dans la langue du
// navigateur — le client l'affiche telle quelle (TirageClient, NightPicker…).
test('EN : les erreurs API suivent le cookie (tirage sur une sélection vide)', async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: 'wsp_lang', value: 'en', url: 'http://localhost:3000' }]);
  const page = await ctx.newPage();
  await page.goto('/register');
  await page.getByLabel('Username').fill(`i18n-${Date.now().toString(36)}`);
  await page.getByLabel('Secret code').fill('1234');
  await page.getByRole('button', { name: 'Create my account' }).click();
  await page.waitForURL('**/etagere');
  // Soirée du jour créée via l'API (étagère vide) : le tirage est refusé
  // et le message d'erreur arrive en anglais.
  const night = await (await page.request.post('/api/nights', { data: { playerIds: [] } })).json();
  const draw = await page.request.post('/api/draw', { data: { nightId: night.nightId, gameIds: [] } });
  expect(draw.status()).toBe(400);
  expect(((await draw.json()) as { error: string }).error).toBe('Empty selection');
  await ctx.close();
});

// T6 complément : la FAQ publique suit aussi le cookie (12 Q/R traduites,
// aria « FAQ: … » dérivé de la question, <html lang="en">).
test('EN : la FAQ est traduite (12 questions, sous-titre, aria dérivé)', async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: 'wsp_lang', value: 'en', url: 'http://localhost:3000' }]);
  const page = await ctx.newPage();
  await page.goto('/faq');
  await expect(page.locator('details.faq')).toHaveCount(12);
  await expect(page.getByText('Everything you need to know before you spin the wheel — and after.')).toBeVisible();
  await expect(page.getByLabel('FAQ: What is What Shall We Play?')).toBeVisible();
  await expect(page.getByText('Game night', { exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await ctx.close();
});
