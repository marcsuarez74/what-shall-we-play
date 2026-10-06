import { test, expect } from '@playwright/test';

test('la FAQ est publique, avec accordéons fonctionnels', async ({ page }) => {
  await page.goto('/faq');
  await expect(page.getByRole('heading', { name: 'FAQ' })).toBeVisible();
  // 2 accordéons ouverts par défaut, 10 fermés
  await expect(page.locator('details.faq[open]')).toHaveCount(2);
  await expect(page.locator('details.faq')).toHaveCount(12);
  // ouverture d'un accordéon FERMÉ via le hook aria, puis refermeture
  // (Chromium ne donne pas le rôle button aux summary en display:flex — on cible l'aria-label)
  const q = page.getByLabel("FAQ : C'est quoi l'étagère ?");
  await q.click();
  await expect(page.locator('details.faq[open]')).toHaveCount(3);
  await q.click();
  await expect(page.locator('details.faq[open]')).toHaveCount(2);
});

test('le visiteur non connecté voit la FAQ sans redirect', async ({ browser }) => {
  const ctx = await browser.newContext(); // aucun cookie de session
  const page = await ctx.newPage();
  await page.goto('/faq');
  await expect(page).not.toHaveURL(/login/);
  await expect(page.getByRole('heading', { name: 'FAQ' })).toBeVisible();
});

test('lien FAQ depuis l accueil non connecté (register)', async ({ page }) => {
  await page.goto('/register');
  await page.getByRole('link', { name: 'Questions fréquentes' }).click();
  await expect(page).toHaveURL(/\/faq$/);
});

test('menu profil → FAQ (connecté)', async ({ page }) => {
  // register gabarit local (Pseudo + Code secret 1234)
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(`faq_${Date.now().toString(36)}`);
  await page.getByLabel('Code secret').fill('1234');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await page.waitForURL('/etagere');
  // hook d ouverture de UserMenu : <summary aria-label="Menu utilisateur">
  await page.getByLabel('Menu utilisateur').click();
  await page.getByRole('link', { name: /FAQ/ }).click();
  await expect(page).toHaveURL(/\/faq$/);
});
