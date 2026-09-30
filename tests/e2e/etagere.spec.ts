import { test, expect } from '@playwright/test';

test('étagère : sélection via fiche, CTA compteur', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(`shelf-${Date.now()}`);
  await page.getByLabel('Code secret').fill('1234');
  const registerDone = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await registerDone; // sinon le goto suivant peut interrompre le POST avant le cookie
  await page.goto('/games/add');
  await page.getByLabel('Titre du jeu').fill('Terraforming Mars');
  await page.getByRole('button', { name: 'Saisir à la main' }).click();
  await page.getByRole('button', { name: 'Ajouter à la ludothèque' }).click();
  // Soirée : le créateur est déjà pré-coché — on ne touche à aucune autre case
  // (les autres utilisateurs listés appartiennent à d'autres comptes)
  await page.getByRole('button', { name: /Lancer la soirée|Créer la soirée/ }).click();
  // Sélection vide : CTA désactivé, aucune sélection possible (Review Focus n°6)
  await expect(page.getByRole('button', { name: 'Touchez une boîte pour l\'ajouter' })).toBeDisabled();
  // Étagère : boîte -> fiche (la fiche enrichie affiche les facts) -> ajouter
  await page.locator('.box').first().click();
  await expect(page.locator('.sheet-facts')).toContainText('Parties jouées');
  await page.getByRole('button', { name: /Ajouter à la sélection/ }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.selcount')).toContainText('Sélection : 1');
  await expect(page.getByRole('button', { name: /Lancer le tirage · 1/ })).toBeEnabled();
});
