import { test, expect } from '@playwright/test';
import { makePng } from './helpers/png';
import { newGame, putOnShelf } from './helpers/shelf';

// v2.0.0 — Étagère vide à la création : chacun ajoute depuis SA ludothèque
// (sélecteur), et « Pas ce soir » a laissé place au « Retirer de la soirée ».
// Les filtres de l'étagère et de la bibliothèque sont couverts plus bas.

async function registerAndStart(page: import('@playwright/test').Page, pseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const reg = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await reg;
  const nightDone = page.waitForResponse((r) => r.url().endsWith('/api/nights') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Créer la soirée' }).click();
  const { nightId } = await (await nightDone).json() as { nightId: number };
  await page.waitForURL('/etagere');
  return nightId;
}

test('étagère vide à la création, le sélecteur ajoute depuis ma ludothèque', async ({ page }) => {
  await registerAndStart(page, `eav3-${Date.now()}`);
  await newGame(page, 'Azul', 'moyen');
  await newGame(page, 'Jaipur', 'petit');
  await page.goto('/etagere');

  // État vide explicite (le cœur du flux v3)
  await expect(page.locator('.empty-shelf')).toBeVisible();
  await expect(page.locator('.empty-shelf h3')).toContainText('L\'étagère est vide');

  // Le CTA ouvre le sélecteur : mes jeux, groupés par format, recherche à accents libres
  await page.getByRole('button', { name: 'Ajouter des jeux depuis ma ludothèque' }).click();
  const sheet = page.locator('.picker-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.pick-row')).toHaveCount(2);
  await sheet.getByLabel('Rechercher dans ma ludothèque').fill('azul'); // insensible à la casse
  await expect(sheet.locator('.pick-row')).toHaveCount(1);
  await sheet.getByLabel('Rechercher dans ma ludothèque').fill('');

  // Un tap = un ajout (✓ vert), le compteur suit ; « Terminé » referme
  await sheet.getByRole('button', { name: /Ajouter Azul/ }).click();
  await expect(sheet.locator('.count')).toContainText('1 jeu ajouté');
  await sheet.getByRole('button', { name: /Ajouter Jaipur/ }).click();
  await expect(sheet.locator('.count')).toContainText('2 jeux ajoutés');
  await sheet.getByRole('button', { name: 'Terminé' }).click();
  await expect(page.locator('.shelf-block .box')).toHaveCount(2);

  // Réouverture : Azul est déjà sur l'étagère (✓), le tap la retire
  await page.locator('.add-more .link-btn').click();
  await expect(sheet).toBeVisible();
  const azul = sheet.getByRole('button', { name: /Retirer Azul/ });
  await azul.click();
  await expect(sheet.locator('.count')).toContainText('1 jeu ajouté');
  await sheet.getByRole('button', { name: 'Terminé' }).click();
  await expect(page.locator('.shelf-block .box')).toHaveCount(1);
});

test('retirer de la soirée : depuis la fiche, l\'étagère redevient vide', async ({ page }) => {
  const nightId = await registerAndStart(page, `retv3-${Date.now()}`);
  await putOnShelf(page, await newGame(page, 'Alpha', 'grand'), nightId);
  await putOnShelf(page, await newGame(page, 'Bravo', 'petit'), nightId);
  await page.goto('/etagere');
  await expect(page.locator('.shelf-block .box')).toHaveCount(2);

  // Fiche d'Alpha → « Retirer de la soirée » (remplace « Pas ce soir »)
  await page.locator('.shelf-block .box').first().click();
  await expect(page.locator('.bottom-sheet')).toBeVisible();
  const post = page.waitForResponse((r) => r.url().includes('/games') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Retirer de la soirée' }).click();
  await post;
  await expect(page.locator('.shelf-block .box')).toHaveCount(1);

  // Un seul jeu restant, retiré à son tour → état vide
  await page.locator('.shelf-block .box').first().click();
  await page.getByRole('button', { name: 'Retirer de la soirée' }).click();
  await expect(page.locator('.empty-shelf')).toBeVisible();
  await expect(page.locator('.chip.selcount')).toContainText('0');
});

test('étagère : spinner pendant le chargement des pochettes', async ({ browser }) => {
  // SW bloqué : sans ça, il sert les pochettes et la route de test ne voit rien
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  const nightId = await registerAndStart(page, `spin-${Date.now()}`);
  const form = new FormData();
  form.set('title', 'Pochette lente'); form.set('box_format', 'moyen');
  const res = await page.request.post('/api/games', {
    multipart: {
      title: 'Pochette lente', box_format: 'moyen',
      cover: { name: 'cover.png', mimeType: 'image/png', buffer: makePng(8, 8) },
    },
  });
  if (!res.ok()) throw new Error(`ajout jeu: ${res.status()} ${await res.text()}`);
  await putOnShelf(page, ((await res.json()) as { id: number }).id, nightId);

  // La pochette met du temps à arriver (réseau lent simulé par interception)
  await page.route('**/api/cover/**', async (route) => {
    await new Promise((r) => setTimeout(r, 900));
    await route.fulfill({ status: 200, contentType: 'image/png', body: makePng(8, 8) });
  });

  // DCL avant les images : on observe le spinner PENDANT le chargement de la pochette
  await page.goto('/etagere', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.box-spin').first()).toBeVisible();
  await expect(page.locator('.box img.on')).toHaveCount(0);
  // une fois chargée : la pochette apparaît en fondu, le spinner disparaît
  await expect(page.locator('.box img.on')).toHaveCount(1);
  await expect(page.locator('.box-spin')).toHaveCount(0);
  await context.close();
});

test('étagère : pochette visible dès le montage quand le cache SW sert l’image (revisite)', async ({ page }) => {
  const nightId = await registerAndStart(page, `swimg-${Date.now()}`);
  const res = await page.request.post('/api/games', {
    multipart: { title: 'Cache chaud', box_format: 'moyen', cover: { name: 'c.png', mimeType: 'image/png', buffer: makePng(8, 8) } },
  });
  if (!res.ok()) throw new Error(`ajout: ${res.status()}`);
  await putOnShelf(page, ((await res.json()) as { id: number }).id, nightId);

  await page.goto('/etagere'); // 1re visite : remplit le cache du service worker
  await expect(page.locator('.box img.on')).toHaveCount(1);
  await page.goto('/etagere'); // 2e visite : le SW sert la pochette AVANT l'hydratation
  await page.waitForTimeout(800);
  await expect(page.locator('.box img.on')).toHaveCount(1);  // ROUGE : opacity 0 à vie
  await expect(page.locator('.box-spin')).toHaveCount(0);    // ROUGE : spinner infini
});

test('étagère : recherche et filtres (joueurs pré-rempli, complexité, durée)', async ({ page }) => {
  const nightId = await registerAndStart(page, `flt-${Date.now()}`);
  await putOnShelf(page, await newGame(page, 'Azul', 'moyen', { min_players: '2', max_players: '4', playtime_min: '35', weight: '1.7' }), nightId);
  await putOnShelf(page, await newGame(page, 'Terraforming Mars', 'grand', { min_players: '1', max_players: '5', playtime_min: '120', weight: '3.4' }), nightId);
  await putOnShelf(page, await newGame(page, 'Jaipur', 'petit', { min_players: '2', max_players: '2', playtime_min: '30', weight: '1.5' }), nightId);
  await page.goto('/etagere');

  // Aucun filtre par défaut : les 3 boîtes sont là
  await page.getByRole('button', { name: /Filtres/ }).click(); // panneau replié par défaut
  const chip1 = page.locator('.fam[aria-label*="joueurs"] .fchip', { hasText: '1' });
  await expect(page.locator('.shelf-block .box')).toHaveCount(3);
  await expect(page.locator('.shelf-count')).toContainText('3 jeux sur 3');

  // Le filtre joueurs reste disponible : en solo, seul Mars (1–5) reste
  await chip1.click();
  await expect(page.locator('.shelf-block .box')).toHaveCount(1);

  // Le retirer → les 3 reviennent
  await chip1.click();
  await expect(page.locator('.shelf-block .box')).toHaveCount(3);

  // Recherche insensible à la casse
  await page.getByLabel('Rechercher un jeu').fill('azul');
  await expect(page.locator('.shelf-block .box')).toHaveCount(1);
  await page.getByLabel('Rechercher un jeu').fill('');

  // Complexité lourde → Mars
  await page.getByRole('button', { name: 'Lourde' }).click();
  await expect(page.locator('.shelf-block .box')).toHaveCount(1);
  await page.getByRole('button', { name: 'Lourde' }).click();

  // Durée 60+ → Mars
  await page.getByRole('button', { name: /60\+ min/ }).click();
  await expect(page.locator('.shelf-block .box')).toHaveCount(1);
});

test('étagère : badge « apporté par » = qui a posé la boîte', async ({ page }) => {
  const pseudo = `bdg-${Date.now()}`;
  const nightId = await registerAndStart(page, pseudo);
  // sticker de l'ajouteur (pas de photo : c'est lui qui doit apparaître)
  await page.request.patch('/api/me', { data: { sticker: '🦊' } });
  await putOnShelf(page, await newGame(page, 'Avec badge', 'moyen'), nightId);
  await page.goto('/etagere');

  const badge = page.locator('.owner-badge').first();
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute('title', `Apporté par ${pseudo}`);
  await expect(badge).toContainText('🦊');
  expect(await badge.evaluate((el) => getComputedStyle(el).width)).toBe('16px');
});

test('badge : la photo de l\'ajouteur est visible (pas avalée par l’opacité de la pochette)', async ({ page }) => {
  const pseudo = `bdgph-${Date.now()}`;
  const nightId = await registerAndStart(page, pseudo);
  const png = makePng(4, 4);
  const up = await page.request.post('/api/me/avatar', {
    multipart: { avatar: { name: 'p.png', mimeType: 'image/png', buffer: png } },
  });
  if (!up.ok()) throw new Error(`avatar: ${up.status()}`);
  await putOnShelf(page, await newGame(page, 'Avec photo', 'moyen'), nightId);
  await page.goto('/etagere');

  const img = page.locator('.owner-badge img').first();
  await expect(img).toBeVisible();
  // L'opacité de la pochette (.box img) ne doit pas s'appliquer à l'img du badge
  expect(await img.evaluate((el) => getComputedStyle(el).opacity)).toBe('1'); // ROUGE avant fix
});

test('bibliothèque : recherche, filtres (dont Boîte) et compteur', async ({ page }) => {
  await registerAndStart(page, `libf-${Date.now()}`);
  const add = async (title: string, meta: Record<string, string>) => {
    const r = await page.request.post('/api/games', { multipart: { title, box_format: 'moyen', ...meta } });
    if (!r.ok()) throw new Error(`ajout ${title}: ${r.status()}`);
  };
  await add('Azul', { min_players: '2', max_players: '4', playtime_min: '35', weight: '1.7' });
  await add('Terraforming Mars', { min_players: '1', max_players: '5', playtime_min: '120', weight: '3.4', box_format: 'grand' });
  await add('Jaipur', { min_players: '2', max_players: '2', playtime_min: '30', weight: '1.5', box_format: 'petit' });
  await page.goto('/library');

  // Panneau de filtres replié par défaut : on le déplie pour la famille Boîte
  await page.getByRole('button', { name: /Filtres/ }).click();

  // Recherche insensible à la casse
  await page.getByLabel('Rechercher un jeu').fill('azul');
  await expect(page.locator('.lib-card')).toHaveCount(1);
  await page.getByLabel('Rechercher un jeu').fill('');

  // Filtre Boîte (dimension propre à la ludothèque)
  await page.locator('.fam[aria-label*="boîte"] .fchip', { hasText: 'Petit' }).click();
  await expect(page.locator('.lib-card')).toHaveCount(1);
  await page.locator('.fam[aria-label*="boîte"] .fchip', { hasText: 'Mini' }).click();
  await expect(page.locator('.lib-card')).toHaveCount(0);
  await expect(page.locator('.lib-empty')).toBeVisible();
  // Reset : « Tout afficher »
  await page.getByRole('button', { name: 'Tout afficher' }).click();
  await expect(page.locator('.lib-card')).toHaveCount(3);
});
