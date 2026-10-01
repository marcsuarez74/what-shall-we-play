import { test, expect } from '@playwright/test';

// Formulaire d'ajout repensé : titre + format -> « Récupérer les infos » (BGG, token)
// -> fiche remplie -> ludothèque. Les appels BGG sont simulés (pas de token en CI).
const stamp = Date.now().toString(36);

const THING = {
  bggId: 503, title: 'Through the Desert', year: 1993, publisher: 'Z-Man Games',
  minPlayers: 2, maxPlayers: 5, playtimeMin: 45, weight: 2.16, rating: 7.2,
  imageUrl: null, designer: 'Reiner Knizia', artist: 'John Gravato', bestPlayers: 3,
  coverName: null,
};

async function register(page: import('@playwright/test').Page, pseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const done = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await done;
}

test('ajout : un seul résultat BGG -> fiche remplie -> ludothèque', async ({ page }) => {
  await page.route('**/api/bgg/search*', (r) =>
    r.fulfill({ json: { results: [{ bggId: 503, name: 'Through the Desert' }] } }));
  await page.route('**/api/bgg/thing*', (r) => r.fulfill({ json: THING }));
  await register(page, `ajout-${stamp}`);

  await page.goto('/games/add');
  await page.getByLabel('Titre du jeu').fill('Through the Desert');
  await page.getByRole('button', { name: 'Grand', exact: true }).click();
  await page.getByRole('button', { name: /Récupérer les infos/ }).click();

  // Les champs apparaissent, pré-remplis depuis BGG
  await expect(page.locator('.sheet-facts')).toContainText('Reiner Knizia');
  await expect(page.locator('.sheet-facts')).toContainText('2–5');
  await page.getByRole('button', { name: 'Ajouter à la ludothèque' }).click();

  await expect(page).toHaveURL(/\/etagere$/);
  // pochette simulée absente : la boîte apparaît avec son placeholder ♟
  await page.getByRole('button', { name: /Lancer la soirée|Créer la soirée/ }).click();
  // Aucun filtre appliqué par défaut : la boîte est là malgré le solo (2–5 joueurs)
  await page.getByRole('button', { name: /Filtres/ }).click(); // panneau replié par défaut
  await expect(page.locator('.shelf-count')).toContainText('1 jeu sur 1');
  // Le filtre joueurs reste disponible : en solo, le jeu 2–5 est écarté
  await page.locator('.fam[aria-label*="joueurs"] .fchip', { hasText: '1' }).click();
  await expect(page.locator('.shelf-count')).toContainText('0 jeu sur 1');
  // On le désactive : la boîte revient
  await page.locator('.fam[aria-label*="joueurs"] .fchip', { hasText: '1' }).click();
  await expect(page.locator('.box').first()).toBeVisible();
  await page.locator('.box').first().click();
  await expect(page.locator('.bottom-sheet')).toContainText('Through the Desert');
});

test('ajout : plusieurs résultats -> liste de choix', async ({ page }) => {
  await page.route('**/api/bgg/search*', (r) => r.fulfill({
    json: { results: [{ bggId: 503, name: 'Through the Desert' }, { bggId: 279537, name: 'The Search for Planet X' }] },
  }));
  await page.route('**/api/bgg/thing*', (r) => r.fulfill({ json: THING }));
  await register(page, `ajout2-${stamp}`);

  await page.goto('/games/add');
  await page.getByLabel('Titre du jeu').fill('through');
  await page.getByRole('button', { name: /Récupérer les infos/ }).click();
  await expect(page.getByRole('button', { name: 'The Search for Planet X' })).toBeVisible();
  await page.getByRole('button', { name: 'Through the Desert' }).click();
  await expect(page.locator('.sheet-facts')).toContainText('Reiner Knizia');
});

test('ajout : aucun résultat -> message orientant', async ({ page }) => {
  await page.route('**/api/bgg/search*', (r) => r.fulfill({ json: { results: [] } }));
  await register(page, `ajout3-${stamp}`);

  await page.goto('/games/add');
  await page.getByLabel('Titre du jeu').fill('Zzzbla');
  await page.getByRole('button', { name: /Récupérer les infos/ }).click();
  await expect(page.locator('.add-form .hint')).toContainText('Aucun jeu trouvé');
});

test('ajout : BGG indisponible (token absent) -> saisie à la main', async ({ page }) => {
  await page.route('**/api/bgg/search*', (r) => r.fulfill({ status: 502, json: { error: 'indisponible' } }));
  await register(page, `ajout4-${stamp}`);

  await page.goto('/games/add');
  await page.getByLabel('Titre du jeu').fill('Azul');
  await page.getByRole('button', { name: /Récupérer les infos/ }).click();
  await expect(page.locator('.add-form .hint')).toContainText('saisir à la main');
  await page.getByRole('button', { name: 'Saisir à la main' }).click();

  await page.getByLabel('Année').fill('2017');
  await page.getByLabel('Éditeur').fill('Next Move Games');
  await page.getByRole('button', { name: 'Ajouter à la ludothèque' }).click();
  await expect(page).toHaveURL(/\/etagere$/);
  await page.getByRole('button', { name: /Lancer la soirée|Créer la soirée/ }).click();
  await page.locator('.box').first().click();
  await expect(page.locator('.bottom-sheet')).toContainText('Azul');
});
