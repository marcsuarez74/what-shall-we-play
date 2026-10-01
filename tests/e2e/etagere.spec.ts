import { test, expect } from '@playwright/test';
import { gameIdByTitle, putOnShelf } from './helpers/shelf';

test('étagère : boîte → fiche, valider sa sélection, lancer', async ({ page }) => {
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
  await page.getByRole('button', { name: /Lancer la soirée|Créer la partie/ }).click();
  // Étagère vide à la création (v3) : le joueur pose sa boîte
  await putOnShelf(page, await gameIdByTitle(page, 'Terraforming Mars'));
  await page.goto('/etagere');
  // v3.0.0 : tant que sa sélection n'est pas validée, c'est l'action principale
  await expect(page.getByRole('button', { name: 'Valider ma sélection' })).toBeVisible();
  // Boîte -> fiche (la fiche enrichie affiche les facts) — plus aucun bloc sélection
  await page.locator('.box').first().click();
  await expect(page.locator('.sheet-facts')).toContainText('Parties jouées');
  await expect(page.locator('.bottom-sheet')).not.toContainText('Ajouter à la sélection');
  await page.keyboard.press('Escape');
  // Valider sa sélection : état partagé ✓ puis le lanceur apparaît (créateur, solo = tout le monde est prêt)
  await page.getByRole('button', { name: 'Valider ma sélection' }).click();
  await expect(page.locator('.pill-ok')).toContainText('✓ Validée');
  await expect(page.locator('.cta-row .btn-copper.pret')).toBeVisible(); // tout le monde est prêt : le lanceur passe au vert
  await page.getByRole('button', { name: 'Lancer · 1' }).click();
  await expect(page).toHaveURL(new RegExp(`/tirage/\\d+`));
});
