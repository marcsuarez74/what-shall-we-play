import { test, expect } from '@playwright/test';

// Import de collection BGG (v3.6.0) : BGG simulé au niveau de NOS routes (pas de token en CI).
const stamp = Date.now().toString(36);
const pseudo = `imp-${stamp}`.slice(0, 20);

const COLLECTION = {
  jeux: [
    { bggId: 174430, titre: 'Gloomhaven', annee: 2017, thumb: null },
    { bggId: 266192, titre: 'Wingspan', annee: 2019, thumb: null },
    { bggId: 13, titre: 'Catan', annee: 1995, thumb: null },
  ],
};
const THING = (id: number, titre: string, cover: string | null) => ({
  bggId: id, title: titre, year: 2019, publisher: 'Éditeur', minPlayers: 2, maxPlayers: 5,
  playtimeMin: 60, weight: 2.4, rating: 8, designer: 'Autrice', artist: 'Artiste',
  bestPlayers: 4, coverName: cover,
});

async function register(page: import('@playwright/test').Page, p: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(p);
  await page.getByLabel('Code secret').fill('1234');
  const done = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await done;
}

test('import : preview dédoublonnée -> import -> enrichissement -> ludothèque', async ({ page }) => {
  await page.route('**/api/bgg/collection*', (r) => r.fulfill({ json: COLLECTION }));
  await page.route('**/api/bgg/thing*', (r) => {
    const id = Number(new URL(r.request().url()).searchParams.get('id'));
    return r.fulfill({ json: THING(id, id === 174430 ? 'Gloomhaven' : 'Wingspan', id === 174430 ? `import-${stamp}.jpg` : null) });
  });
  await register(page, pseudo);
  // Fiche manuelle « Wingspan » (sans bgg_id) + « Catan » déjà lié à BGG (bgg_id 13)
  await page.request.post('/api/games', { form: { title: 'Wingspan', box_format: 'moyen' } });
  await page.request.post('/api/games', { form: { title: 'Catan', box_format: 'grand', bgg_id: '13' } });

  await page.goto('/games/import');
  await page.getByLabel('Pseudo BGG').fill('quelquun');
  await page.getByRole('button', { name: 'Récupérer ma collection' }).click();

  // Preview : les 3 états
  await expect(page.getByText('Déjà dans ta ludothèque')).toBeVisible();            // Catan (bgg_id 13)
  await expect(page.getByText('Doublon probable')).toBeVisible();                   // Wingspan (manuel)
  await expect(page.getByText('+ Nouveau')).toHaveCount(1);                         // Gloomhaven
  await expect(page.getByRole('button', { name: 'Importer Gloomhaven' })).toBeVisible();
  // Format global -> moyen, pastille par ligne suit
  await page.getByRole('button', { name: 'Moyen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Format de Gloomhaven : moyen' })).toBeVisible();
  // Le doublon probable reste en enrichir : pas de pastille format pour lui
  await expect(page.getByRole('button', { name: /Format de Wingspan/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Importer 2 jeux' }).click();
  await expect(page.getByText('Collection importée ✓')).toBeVisible();
  await expect(page.locator('.imp-stats li.enr b')).toHaveText('1');
  await expect(page.locator('.imp-stats li.ok b')).toHaveText('1');

  // Ludothèque : 3 fiches (Wingspan + Catan semées, Gloomhaven importé — pas de doublon Wingspan), Wingspan enrichie
  const api = await page.request.get('/api/games');
  const { games } = await api.json();
  expect(games).toHaveLength(3);
  const ws = games.find((g: { title: string }) => g.title === 'Wingspan');
  expect(ws.bgg_id).toBe(266192);         // enrichi
  expect(ws.box_format).toBe('moyen');    // intact (Review Focus n°4)
  const gh = games.find((g: { title: string }) => g.title === 'Gloomhaven');
  expect(gh.bgg_id).toBe(174430);
  expect(gh.box_format).toBe('moyen');    // format choisi
  expect(gh.cover_path).toBe(`import-${stamp}.jpg`);
});

test('import : relance idempotente — tout devient « déjà présent », rien à importer', async ({ page }) => {
  await page.route('**/api/bgg/collection*', (r) => r.fulfill({ json: COLLECTION }));
  await page.route('**/api/bgg/thing*', (r) => {
    const id = Number(new URL(r.request().url()).searchParams.get('id'));
    return r.fulfill({ json: THING(id, 'X', null) });
  });
  await register(page, `rel-${stamp}`.slice(0, 20));
  await page.request.post('/api/games', { form: { title: 'Wingspan', box_format: 'moyen' } });
  await page.request.post('/api/games', { form: { title: 'Catan', box_format: 'grand', bgg_id: '13' } });

  // Premier import complet
  await page.goto('/games/import');
  await page.getByLabel('Pseudo BGG').fill('quelquun');
  await page.getByRole('button', { name: 'Récupérer ma collection' }).click();
  await page.getByRole('button', { name: 'Importer 2 jeux' }).click();
  await expect(page.getByText('Collection importée ✓')).toBeVisible();

  // Relance (épingles Review Focus n°3) : Wingspan enrichie (bgg_id posé) redevient « déjà présente »
  await page.goto('/games/import');
  await page.getByLabel('Pseudo BGG').fill('quelquun');
  await page.getByRole('button', { name: 'Récupérer ma collection' }).click();
  await expect(page.getByText('Déjà dans ta ludothèque')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Rien à importer' })).toBeDisabled();
});

test('import : un échec n\u2019arrête pas la boucle — réessai rejoue seulement l\u2019échec', async ({ page }) => {
  await page.route('**/api/bgg/collection*', (r) => r.fulfill({ json: COLLECTION }));
  await register(page, `ech-${stamp}`.slice(0, 20));
  await page.request.post('/api/games', { form: { title: 'Catan', box_format: 'grand', bgg_id: '13' } });
  // Gloomhaven (174430) échoue (502), Wingspan (266192) passe — échec en milieu de boucle
  await page.route('**/api/bgg/thing*', (r) => {
    const id = Number(new URL(r.request().url()).searchParams.get('id'));
    return r.fulfill({ status: id === 174430 ? 502 : 200,
      json: id === 174430 ? { error: 'Fiche BGG indisponible' } : THING(id, 'Wingspan', null) });
  });

  await page.goto('/games/import');
  await page.getByLabel('Pseudo BGG').fill('quelquun');
  await page.getByRole('button', { name: 'Récupérer ma collection' }).click();
  await page.getByRole('button', { name: 'Importer 2 jeux' }).click();
  await expect(page.getByText('Presque tout est importé')).toBeVisible();
  await expect(page.locator('.imp-stats li.ko b')).toHaveText('1');
  await expect(page.locator('.imp-stats li.ok b')).toHaveText('1');

  // Réessai : seul l'échec est rejoué (épingles Review Focus n°5)
  await page.unroute('**/api/bgg/thing*');
  await page.route('**/api/bgg/thing*', (r) =>
    r.fulfill({ json: THING(Number(new URL(r.request().url()).searchParams.get('id')), 'Gloomhaven', null) }));
  await page.getByRole('button', { name: 'Réessayer le jeu en échec' }).click();
  await expect(page.getByText('Collection importée ✓')).toBeVisible();
  const api = await page.request.get('/api/games');
  const { games } = await api.json();
  expect(games).toHaveLength(3); // Catan + Wingspan (1er passage) + Gloomhaven (réessai)
});
