import { test, expect } from '@playwright/test';

// Import d'un fichier CSV Myludo (v4.20.0) : BGG simulé au niveau de NOS routes (search + thing).
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

const RECHERCHE: Record<string, { bggId: number; name: string; annee: number | null }[]> = {
  Gloomhaven: [{ bggId: 174430, name: 'Gloomhaven', annee: 2017 }],
  Wingspan: [{ bggId: 266192, name: 'Wingspan', annee: 2019 }],
  Splendor: [{ bggId: 148228, name: 'Splendor', annee: 2014 }, { bggId: 999001, name: 'Splendor', annee: 2024 }],
};
const THING = (id: number) => ({
  bggId: id, title: id === 174430 ? 'Gloomhaven' : id === 266192 ? 'Wingspan' : 'Splendor', year: 2017,
  publisher: 'Éditeur BGG', minPlayers: 2, maxPlayers: 5, playtimeMin: 45, weight: 2.4, rating: 8,
  designer: 'Auteur BGG', artist: 'Artiste BGG', bestPlayers: 4, imageUrl: null,
  coverName: id === 174430 ? `csv-${stamp}.jpg` : null,
});

async function register(page: import('@playwright/test').Page, p: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(p);
  await page.getByLabel('Code secret').fill('1234');
  const done = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await done;
}

test('import CSV : rapprochement BGG, choix, sans pochette, enrichissement -> ludothèque', async ({ page }) => {
  await page.route('**/api/bgg/search*', (r) => {
    const q = new URL(r.request().url()).searchParams.get('q') ?? '';
    return r.fulfill({ json: { results: RECHERCHE[q] ?? [] } });
  });
  await page.route('**/api/bgg/thing*', (r) =>
    r.fulfill({ json: THING(Number(new URL(r.request().url()).searchParams.get('id'))) }));
  await register(page, `csv_${stamp}`.slice(0, 20));
  // Fiche manuelle « Wingspan » (sans bgg_id) + « Catan » déjà lié à BGG
  await page.request.post('/api/games', { form: { title: 'Wingspan', box_format: 'moyen' } });
  await page.request.post('/api/games', { form: { title: 'Catan', box_format: 'grand', bgg_id: '13' } });

  await page.goto('/games/add');
  await page.getByRole('link', { name: /Importer un fichier CSV/ }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: 'collection.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });

  await expect(page.getByText('Recherche terminée')).toBeVisible();
  await expect(page.getByText('✓ Gloomhaven (2017)')).toBeVisible();
  await expect(page.getByText('fiche complétée')).toBeVisible();                     // Wingspan manuel
  await expect(page.getByText('Déjà dans ta ludothèque', { exact: false })).toHaveCount(2); // Catan + Wingspan
  await expect(page.getByText('En double dans le fichier')).toBeVisible();           // 2e Gloomhaven
  // Extension masquée par défaut
  await expect(page.getByText('Gloomhaven - Forgotten Circles')).toHaveCount(0);
  await page.getByRole('switch', { name: /Inclure les extensions/ }).click();
  await expect(page.getByText('Gloomhaven - Forgotten Circles')).toBeVisible();
  await page.getByRole('switch', { name: /Inclure les extensions/ }).click();
  await expect(page.getByText('Gloomhaven - Forgotten Circles')).toHaveCount(0);

  // À vérifier : Splendor (2 candidats) + Jeu Inconnu (introuvable)
  await page.getByRole('button', { name: /À vérifier/ }).click();
  await expect(page.locator('.imp-jeu')).toHaveCount(2);
  await page.getByText('2 jeux possibles').click();
  await page.getByRole('dialog').getByRole('button', { name: /2024/ }).click();
  await page.getByText('Introuvable sur BGG').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Importer sans pochette' }).click();
  await expect(page.getByText('Rien à vérifier')).toBeVisible();
  await page.getByRole('button', { name: /Tous/ }).click();

  await page.getByRole('button', { name: 'Ajouter 4 jeux' }).click();
  await expect(page.getByText('Collection importée ✓')).toBeVisible();
  await expect(page.locator('.imp-stats li.ok b')).toHaveText('3');
  await expect(page.locator('.imp-stats li.enr b')).toHaveText('1');
  await expect(page.locator('.imp-stats li.dup b')).toHaveText('3'); // Splendor, Jeu Inconnu, Wingspan (mock sans pochette)

  const { games } = await (await page.request.get('/api/games')).json();
  expect(games).toHaveLength(5);
  const par = (t: string) => games.find((g: { title: string }) => g.title === t);
  expect(par('Gloomhaven')).toMatchObject({
    bgg_id: 174430, cover_path: `csv-${stamp}.jpg`, box_format: 'grand',
    min_players: 1, max_players: 4, publisher: 'Cephalofair', designer: 'Isaac Childres', artist: 'Artiste BGG' });
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

test('import JSON Myludo : format détecté, titre retrouvé par repli', async ({ page }) => {
  const vues: string[] = [];
  await page.route('**/api/bgg/search*', (r) => {
    const q = new URL(r.request().url()).searchParams.get('q') ?? '';
    vues.push(q);
    return r.fulfill({ json: { results: RECHERCHE[q] ?? [] } });
  });
  await page.route('**/api/bgg/thing*', (r) =>
    r.fulfill({ json: THING(Number(new URL(r.request().url()).searchParams.get('id'))) }));
  await register(page, `json_${stamp}`.slice(0, 20));
  await page.goto('/games/import-csv');
  const json = JSON.stringify([{ ID: 1, Titre: 'Wingspan (Nouvelle édition)', Édition: 2024, Type: 'basegame',
    'Joueur(s)': '1 — 5', Durée: 70, 'Éditeur(s)': ['Matagot'] }]);
  await page.locator('input[type="file"]').setInputFiles({ name: 'collection.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await expect(page.locator('.csv-badge.json')).toBeVisible();
  await expect(page.getByText(/^✓ Wingspan/)).toBeVisible();
  expect(vues).toEqual(['Wingspan (Nouvelle édition)', 'Wingspan']);
});

test('import JSON : JSON mal formé -> message dédié', async ({ page }) => {
  await register(page, `jsonko_${stamp}`.slice(0, 20));
  await page.goto('/games/import-csv');
  await page.locator('input[type="file"]').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('[{"Titre":') });
  await expect(page.locator('.hint[role=alert]')).toContainText('JSON est illisible');
});
