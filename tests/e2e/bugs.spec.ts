import { test, expect, Page } from '@playwright/test';

// Aide locale : inscription via l'UI (pseudos ≤ 20 caractères — ruling v3.2).
async function register(page: Page, pseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const reg = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await reg;
}

test('menu : « Rapporter un bug » présent et mène à /bugs', async ({ page }) => {
  await register(page, `menu-${Date.now().toString(36)}`);
  await page.goto('/etagere');
  await page.locator('.user-chip summary').click();
  const lien = page.getByRole('link', { name: /Rapporter un bug/ });
  await expect(lien).toBeVisible();
  await lien.click();
  await page.waitForURL('**/bugs**');
});
