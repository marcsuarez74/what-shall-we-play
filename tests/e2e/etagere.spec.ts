import { test, expect } from '@playwright/test';
import { gameIdByTitle, putOnShelf } from './helpers/shelf';

test('étagère : boîte → fiche, valider sa sélection, lancer', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(`shelf_${Date.now()}`);
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

// v3.2.1 — signalement joueur : « si on scroll sur la partie avec les boîtes ça
// ne scroll pas ». Vestige du touch-action: pan-x (appui maintenu supprimé en
// v3.0.0) : le navigateur ne revendiquait QUE l'horizontal au-dessus des boîtes.
test('le scroll vertical de la page passe au-dessus des rangées de boîtes', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(`vscroll_${Date.now()}`.slice(0, 20));
  await page.getByLabel('Code secret').fill('1234');
  const reg = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await reg;
  await page.goto('/games/add');
  await page.getByLabel('Titre du jeu').fill('Azul');
  await page.getByRole('button', { name: 'Saisir à la main' }).click();
  await page.getByRole('button', { name: 'Ajouter à la ludothèque' }).click();
  await page.getByRole('button', { name: 'Créer la partie' }).click();
  await putOnShelf(page, await gameIdByTitle(page, 'Azul'));
  await page.goto('/etagere');
  await page.locator('.box').first().waitFor();

  // Le navigateur ne revendique pas l'axe horizontal seul sur une boîte
  const touch = await page.locator('.box').first().evaluate((el) => getComputedStyle(el).touchAction);
  expect(touch).not.toBe('pan-x');

  // Et un molet vertical au-dessus de la rangée fait bien défiler la page
  const y0 = await page.evaluate(() => window.scrollY);
  await page.locator('.row').first().hover();
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(200);
  const y1 = await page.evaluate(() => window.scrollY);
  expect(y1).toBeGreaterThan(y0);
});
