import { test, expect } from '@playwright/test';

// Barre d'onglets + bibliothèque détaillée : cartes riches, fiche au toucher, format modifiable.
const stamp = Date.now().toString(36);

test('navigation : onglets entre les pages, fiche depuis la bibliothèque, format persistant', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(`biblio-${stamp}`);
  await page.getByLabel('Code secret').fill('1234');
  const done = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await done;

  await page.goto('/games/add');
  await page.getByLabel('Titre du jeu').fill('Azul');
  await page.getByRole('button', { name: 'Saisir à la main' }).click();
  // pochette portrait : certains visuels débordaient de leur boîte sur l'étagère (bug couvert ici)
  await page.locator('input[type="file"]').setInputFiles('tests/fixtures/cover-portrait.jpg');
  await page.getByLabel('Année').fill('2017');
  await page.getByLabel('Éditeur').fill('Next Move Games');
  await page.getByRole('button', { name: 'Ajouter à la ludothèque' }).click();
  await expect(page).toHaveURL(/\/etagere$/);

  // Barre d'onglets : Étagère -> Ludothèque -> Ajouter -> Étagère
  await page.getByRole('link', { name: 'Ludothèque' }).click();
  await expect(page.getByRole('heading', { name: /Ma ludothèque/ })).toBeVisible();
  await page.getByRole('link', { name: 'Ajouter' }).click();
  await expect(page.getByRole('heading', { name: 'Ajouter un jeu' })).toBeVisible();
  await page.getByRole('link', { name: 'Ludothèque' }).click();

  // Carte détaillée : année · éditeur, chips joueurs/durée (absents ici : seuls l'année·éditeur s'affichent)
  const card = page.locator('.lib-card').first();
  await expect(card).toContainText('Azul');
  await expect(card).toContainText('2017 · Next Move Games');

  // Fiche complète au toucher (mode bibliothèque : pas de bloc sélection)
  await card.getByRole('button', { name: /Voir la fiche/ }).click();
  await expect(page.locator('.sheet-facts')).toContainText('Parties jouées');
  await expect(page.locator('.bottom-sheet')).not.toContainText('Ajouter à la sélection');
  await page.locator('.sheet-backdrop').click({ position: { x: 10, y: 10 } });

  // Le format se change depuis la carte, l'étagère suit (on attend la fin du PATCH :
  // en CI, naviguer trop tôt rendait l'étagère avec l'ancien format)
  const formatPatch = page.waitForResponse(
    (r) => r.url().includes('/api/games/') && r.request().method() === 'PATCH' && r.ok());
  await card.getByLabel(/Format de boîte/).selectOption('petit');
  await formatPatch;
  await page.getByRole('link', { name: 'Étagère' }).click();

  // Aucune pochette ne dépasse de sa boîte (photos portrait comprises)
  await page.getByRole('button', { name: /Lancer la soirée|Créer la soirée/ }).click();
  const debords = await page.evaluate(() =>
    [...document.querySelectorAll('.box img')].filter((img) => {
      const b = img.closest('.box')!.getBoundingClientRect();
      const i = img.getBoundingClientRect();
      return i.width > b.width + 1 || i.height > b.height + 1;
    }).length);
  expect(debords).toBe(0);
  await page.locator('.box').first().click();
  await expect(page.locator('.bottom-sheet')).toContainText('Petit');
});
