import { test, expect } from '@playwright/test';

test('étagère : sélection via fiche, CTA compteur', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(`shelf-${Date.now()}`);
  await page.getByLabel('Code secret').fill('1234');
  const registerDone = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await registerDone; // sinon le goto suivant peut interrompre le POST avant le cookie
  await page.goto('/games/add');
  await page.getByLabel('Titre').fill('Terraforming Mars');
  await page.getByLabel('Format de boîte').selectOption('grand');
  await page.getByRole('button', { name: 'Ajouter à ma bibliothèque' }).click();
  // Soirée : se cocher soi-même
  await page.getByRole('checkbox').first().check();
  await page.getByRole('button', { name: /Lancer la soirée|Créer la soirée/ }).click();
  // Sélection vide : CTA désactivé, aucune sélection possible (Review Focus n°6)
  await expect(page.getByRole('button', { name: 'Touchez une boîte pour l\'ajouter' })).toBeDisabled();
  // Étagère : boîte -> fiche -> ajouter
  await page.locator('.box').first().click();
  await page.getByRole('button', { name: /Ajouter à la sélection/ }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.selcount')).toContainText('Sélection : 1');
  await expect(page.getByRole('button', { name: /Lancer le tirage · 1/ })).toBeEnabled();
});
