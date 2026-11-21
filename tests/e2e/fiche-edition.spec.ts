import { test, expect } from '@playwright/test';
import { newGame } from './helpers/shelf';
import { passerBienvenue } from './helpers/inscription';

// v4.24.0 — fiche d'un jeu de la ludothèque : « Lier à BGG » récupère pochette et infos
// (stub BGG : Gloomhaven 174430), puis « Modifier » corrige à la main.
test('lier un jeu importé sans pochette à BGG, puis le modifier', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(`fe_${Date.now().toString(36)}`);
  await page.getByLabel('Code secret').fill('1234');
  const done = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await done;
  await passerBienvenue(page);
  await newGame(page, 'Gloomhaven', 'grand');

  await page.goto('/library');
  await page.locator('.lib-card').first().getByRole('button', { name: /Voir la fiche/ }).click();
  const sheet = page.locator('.bottom-sheet');
  await expect(sheet.locator('img.sheet-cover')).toHaveCount(0);

  // Lier : recherche pré-remplie avec le titre, aperçu, puis la fiche remplace les infos
  await sheet.getByRole('button', { name: '🔗 Lier à BGG' }).click();
  await expect(sheet.getByLabel('Rechercher sur BGG')).toHaveValue('Gloomhaven');
  await sheet.locator('.csv-cand', { hasText: 'Gloomhaven' }).click();
  await expect(sheet.locator('.fe-apercu')).toContainText('Le titre « Gloomhaven » et le format de boîte restent.');
  await sheet.getByRole('button', { name: 'Utiliser cette fiche' }).click();
  await expect(sheet.locator('.fe-toast')).toHaveText('✓ Pochette et infos récupérées depuis BGG', { timeout: 30_000 });
  await expect(sheet.locator('img.sheet-cover')).toBeVisible();
  await expect(sheet.getByRole('button', { name: '🔗 Changer de fiche BGG' })).toBeVisible();
  await expect(sheet.locator('.bgg-link')).toBeVisible();

  // Modifier : le titre change partout
  await sheet.getByRole('button', { name: '✏️ Modifier' }).click();
  await sheet.getByLabel('Titre').fill('Gloomhaven (VF)');
  await sheet.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(sheet.locator('.fe-toast')).toHaveText('✓ Modifications enregistrées');
  await expect(sheet).toContainText('Gloomhaven (VF)');
  await page.locator('.sheet-backdrop').click({ position: { x: 10, y: 10 } });
  await expect(page.locator('.lib-card').first()).toContainText('Gloomhaven (VF)');
});
