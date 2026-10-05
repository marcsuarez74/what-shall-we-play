import { test, expect } from '@playwright/test';

// Page de connexion publique — attribution BGG demandée par le client (v4.4.0).
test('login : attribution « Powered by BoardGameGeek » visible', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('.auth-form img.auth-bgg')).toBeVisible();
  await expect(page.locator('.auth-form img.auth-bgg')).toHaveAttribute('alt', 'Powered by BoardGameGeek');
});
