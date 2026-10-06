import { test, expect } from '@playwright/test';
import { gameIdByTitle, putOnShelf } from './helpers/shelf';

// Barre d'onglets + bibliothèque détaillée : cartes riches, fiche au toucher, format modifiable.
const stamp = Date.now().toString(36);

test('navigation : onglets entre les pages, fiche depuis la bibliothèque, format persistant', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(`biblio_${stamp}`);
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
  await page.getByRole('button', { name: /Lancer la soirée|Créer la partie/ }).click();
  // Étagère vide à la création (v3) : le joueur pose Azul depuis sa ludothèque
  await putOnShelf(page, await gameIdByTitle(page, 'Azul'));
  await page.goto('/etagere');
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

// v4.5.0 : bouton « Récupérer les pochettes » — les jeux BGG sans image sont
// complétés (fiche /thing + téléchargement), liste et bottom-sheet s'enrichissent.
test('ludothèque : récupérer les pochettes manquantes', async ({ page }) => {
  const THING = { bggId: 503, title: 'Through the Desert', year: 1993, publisher: 'Z-Man Games',
    minPlayers: 2, maxPlayers: 5, playtimeMin: 45, weight: 2.16, rating: 7.2,
    imageUrl: null, designer: 'Reiner Knizia', artist: 'John Gravato', bestPlayers: 3, coverName: null };
  // Ajout BGG sans pochette (fiche sans image)
  await page.route('**/api/bgg/search*', (r) => r.fulfill({ json: { results: [{ bggId: 503, name: 'Through the Desert', annee: 1993 }] } }));
  await page.route('**/api/bgg/thing*', (r) => r.fulfill({ json: THING }));
  const stamp = Date.now().toString(36);
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(`covers_${stamp}`);
  await page.getByLabel('Code secret').fill('1234');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await page.waitForURL('**/etagere');

  await page.goto('/games/add');
  await page.getByLabel('Titre du jeu').fill('Through the Desert');
  await page.getByRole('button', { name: 'Through the Desert' }).click();
  await page.getByRole('button', { name: 'Ajouter à la ludothèque' }).click();
  await page.waitForURL('**/etagere');

  // La ludothèque voit un jeu BGG sans image → le bouton apparaît
  await page.goto('/library');
  const btn = page.getByRole('button', { name: 'Récupérer les pochettes' });
  await expect(btn).toBeVisible();

  // La pochette devient disponible côté BGG (le stub BGG_BASE sert une fiche
  // avec image pour tout id) → clic → l'image remplace le ♟
  await btn.click();
  await expect(page.locator('.lib-cover img').first()).toBeVisible();
});
