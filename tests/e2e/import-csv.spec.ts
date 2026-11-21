import { test, expect } from '@playwright/test';

// Import d'un fichier CSV Myludo (v4.20.0). v4.23.0 : l'import tourne sur le serveur — BGG est
// le stub tests/e2e/bgg-stub.cjs (Gloomhaven, Wingspan, Splendor ×2 ; le reste introuvable).
const stamp = Date.now().toString(36);

const CSV = [
  "﻿'ID;Titre;Sous-titre;Édition;Type;Joueur(s);Durée;Éditeur(s);Auteur(s);Illustrateur(s)",
  '1;Gloomhaven;;2017;basegame;"1 — 4";"60 — 120";Cephalofair;"Isaac Childres";',
  '2;Wingspan;;2019;basegame;"1 — 5";70;Matagot;;',
  '3;Catan;;1995;basegame;"3 — 4";90;;;',
  '4;Splendor;;2024;basegame;"2 — 4";30;;;',
  '5;"Jeu Inconnu";;2020;basegame;Duo;15;;;',
  '6;"Gloomhaven - Forgotten Circles";;2019;extension;"1 — 4";;;;',
  '7;Gloomhaven;;2017;basegame;;;;;',
].join('\r\n');

const LONG = { timeout: 60_000 }; // BGG (stub) interrogé par le serveur, ~1 requête/s

async function register(page: import('@playwright/test').Page, p: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(p);
  await page.getByLabel('Code secret').fill('1234');
  const done = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await done;
}

test('import CSV : rapprochement BGG, choix, sans pochette, enrichissement -> ludothèque', async ({ page }) => {
  await register(page, `csv_${stamp}`.slice(0, 20));
  // Fiche manuelle « Wingspan » (sans bgg_id) + « Catan » déjà lié à BGG
  await page.request.post('/api/games', { form: { title: 'Wingspan', box_format: 'moyen' } });
  await page.request.post('/api/games', { form: { title: 'Catan', box_format: 'grand', bgg_id: '13' } });

  await page.goto('/games/add');
  await page.getByRole('link', { name: /Importer un fichier CSV/ }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: 'collection.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });

  await expect(page.getByText('Recherche terminée')).toBeVisible(LONG);
  await expect(page.getByText('✓ Gloomhaven (2017)')).toBeVisible();
  await expect(page.getByText('fiche complétée')).toBeVisible();                     // Wingspan manuel
  await expect(page.getByText('Déjà dans ta ludothèque', { exact: false })).toHaveCount(2); // Catan + Wingspan
  await expect(page.getByText('En double dans le fichier')).toBeVisible();           // 2e Gloomhaven
  // Extension masquée par défaut
  await expect(page.getByText('Gloomhaven - Forgotten Circles')).toHaveCount(0);
  await page.getByRole('switch', { name: /Inclure les extensions/ }).click();
  await expect(page.getByText('Gloomhaven - Forgotten Circles')).toBeVisible();
  await expect(page.getByText('Recherche terminée')).toBeVisible(LONG); // l'extension a été cherchée
  await page.getByRole('switch', { name: /Inclure les extensions/ }).click();
  await expect(page.getByText('Gloomhaven - Forgotten Circles')).toHaveCount(0);

  // v4.22.3 — À vérifier : Splendor (2 candidats) ; Introuvables : Jeu Inconnu
  await page.getByRole('button', { name: /À vérifier/ }).click();
  await expect(page.locator('.imp-jeu')).toHaveCount(1);
  await page.getByText('2 jeux possibles').click();
  await page.getByRole('dialog').getByRole('button', { name: /2024/ }).click();
  await expect(page.getByText('Rien à choisir')).toBeVisible(LONG);
  await page.getByRole('button', { name: /Introuvables/ }).click();
  await expect(page.locator('.imp-jeu')).toHaveCount(1);
  await page.getByText('Introuvable sur BGG').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Importer sans pochette' }).click();
  await expect(page.getByText('Tout est trouvé')).toBeVisible();
  await page.getByRole('button', { name: /Tous/ }).click();

  await page.getByRole('button', { name: 'Ajouter 4 jeux' }).click();
  await expect(page.getByText('Collection importée ✓')).toBeVisible(LONG);
  await expect(page.locator('.imp-stats li.ok b')).toHaveText('3');
  await expect(page.locator('.imp-stats li.enr b')).toHaveText('1');
  await expect(page.locator('.imp-stats li.dup b')).toHaveText('1'); // Jeu Inconnu (le stub sert les pochettes)

  const { games } = await (await page.request.get('/api/games')).json();
  expect(games).toHaveLength(5);
  const par = (t: string) => games.find((g: { title: string }) => g.title === t);
  expect(par('Gloomhaven')).toMatchObject({
    bgg_id: 174430, cover_path: expect.stringMatching(/\.(jpg|webp)$/), box_format: 'grand',
    min_players: 1, max_players: 4, publisher: 'Cephalofair', designer: 'Isaac Childres' });
  expect(par('Wingspan')).toMatchObject({ bgg_id: 266192, box_format: 'moyen', max_players: 5 });
  expect(par('Splendor').bgg_id).toBe(999001);
  expect(par('Jeu Inconnu')).toMatchObject({ bgg_id: null, min_players: 2, max_players: 2, playtime_min: 15 });
});

test('import CSV : fichier illisible -> message, on reste sur l’écran fichier', async ({ page }) => {
  await register(page, `csvko_${stamp}`.slice(0, 20));
  await page.goto('/games/import-csv');
  await page.locator('input[type="file"]').setInputFiles({ name: 'x.csv', mimeType: 'text/csv', buffer: Buffer.from('a;b\n1;2') });
  await expect(page.locator('.hint[role=alert]')).toContainText('export Myludo');
  await expect(page.getByText('Choisir un fichier CSV').first()).toBeVisible();
});

test('import JSON Myludo : titre retrouvé par repli ; l’import continue quand on quitte la page', async ({ page }) => {
  await register(page, `json_${stamp}`.slice(0, 20));
  await page.goto('/games/import-csv');
  const json = JSON.stringify([{ ID: 1, Titre: 'Wingspan (Nouvelle édition)', Édition: 2024, Type: 'basegame',
    'Joueur(s)': '1 — 5', Durée: 70, 'Éditeur(s)': ['Matagot'] }]);
  await page.locator('input[type="file"]').setInputFiles({ name: 'collection.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await expect(page.locator('.csv-fichier .csv-badge.json')).toBeVisible();
  // v4.23.0 — on part ailleurs : la pastille suit l'import et y ramène.
  await page.goto('/library');
  await expect(page.locator('.imp-pastille')).toContainText('tout est trouvé', LONG);
  await page.locator('.imp-pastille').click();
  await expect(page.getByText(/^✓ Wingspan/)).toBeVisible();
  await page.goto('/games/add');
  await expect(page.locator('.imp-carte')).toContainText('collection.json');
});

test('import JSON : JSON mal formé -> message dédié', async ({ page }) => {
  await register(page, `jsonko_${stamp}`.slice(0, 20));
  await page.goto('/games/import-csv');
  await page.locator('input[type="file"]').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('[{"Titre":') });
  await expect(page.locator('.hint[role=alert]')).toContainText('JSON est illisible');
});
