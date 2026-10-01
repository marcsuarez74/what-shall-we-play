import { test, expect } from '@playwright/test';
import { makePng } from './helpers/png';

async function registerAndStart(page: import('@playwright/test').Page, pseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const reg = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await reg;
  const nightDone = page.waitForResponse((r) => r.url().endsWith('/api/nights') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Créer la soirée' }).click();
  await nightDone;
  await page.waitForURL('/etagere');
}

test('« Pas ce soir » écarte un jeu du tirage puis le remet', async ({ page }) => {
  await registerAndStart(page, `pcs-${Date.now()}`);
  for (const [t, f] of [['Alpha', 'grand'], ['Bravo', 'petit']] as const) {
    const form = new FormData();
    form.set('title', t); form.set('box_format', f);
    const res = await page.request.post('/api/games', { form });
    if (!res.ok()) throw new Error(`ajout jeu ${t}: ${res.status()} ${await res.text()}`);
  }
  await page.goto('/etagere');
  await expect(page.locator('.shelf-block .box')).toHaveCount(2);
  await expect(page.locator('.excluded-row .box')).toHaveCount(0);

  // Fiche d'Alpha (1re boîte) → « Pas ce soir »
  await page.locator('.shelf-block .box').first().click();
  await expect(page.locator('.bottom-sheet')).toBeVisible();
  const post = page.waitForResponse((r) => r.url().includes('/excludes') && r.request().method() === 'POST');
  await page.getByRole('button', { name: /Pas ce soir/ }).click();
  await post;

  // La boîte quitte les blocs, apparaît dans « Écartés ce soir »
  await expect(page.locator('.shelf-block:not(.excluded-block) .box')).toHaveCount(1);
  await expect(page.locator('.excluded-row .box')).toHaveCount(1);
  await expect(page.locator('.excluded-title')).toContainText('Écartés ce soir (1)');
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();

  // Fiche de la boîte écartée → « Remettre ce soir » la restitue
  await page.locator('.excluded-row .box').first().click();
  await expect(page.locator('.bottom-sheet')).toBeVisible();
  const del = page.waitForResponse(async (r) => r.url().includes('/excludes')
    && r.request().method() === 'POST' && (await r.request().postDataJSON())?.excluded === false);
  await page.getByRole('button', { name: /Remettre ce soir/ }).click();
  await del;
  await expect(page.locator('.shelf-block:not(.excluded-block) .box')).toHaveCount(2);
  await expect(page.locator('.excluded-row .box')).toHaveCount(0);
});

test('un jeu écarté reste sélectionnable nulle part et le compteur Sélection est intact', async ({ page }) => {
  await registerAndStart(page, `pcs2-${Date.now()}`);
  const form = new FormData();
  form.set('title', 'Solo'); form.set('box_format', 'moyen');
  const res = await page.request.post('/api/games', { form });
  if (!res.ok()) throw new Error(`ajout jeu: ${res.status()}`);
  await page.goto('/etagere');
  await page.locator('.shelf-block .box').first().click();
  const post = page.waitForResponse((r) => r.url().includes('/excludes') && r.request().method() === 'POST');
  await page.getByRole('button', { name: /Pas ce soir/ }).click();
  await post;
  await expect(page.locator('.excluded-row .box')).toHaveCount(1);
  // Le compteur Sélection reste à 0
  await expect(page.locator('.chip.selcount')).toContainText('0');
  // Plus aucune boîte dans les blocs pour lancer un tirage
  await expect(page.locator('.shelf-block:not(.excluded-block) .box')).toHaveCount(0);
});

test('bibliothèque : la pilule « Pas ce soir » écarte le jeu du tirage', async ({ page }) => {
  await registerAndStart(page, `pcsb-${Date.now()}`);
  const form = new FormData();
  form.set('title', 'Biblio'); form.set('box_format', 'petit');
  const res = await page.request.post('/api/games', { form });
  if (!res.ok()) throw new Error(`ajout jeu: ${res.status()}`);

  await page.goto('/library');
  const pill = page.getByRole('button', { name: /Écarter Biblio du tirage/ });
  await expect(pill).toBeVisible();
  const post = page.waitForResponse((r) => r.url().includes('/excludes') && r.request().method() === 'POST');
  await pill.click();
  await post;
  await expect(page.getByRole('button', { name: /Remettre Biblio au tirage/ })).toBeVisible();

  // Vérification croisée : le jeu a quitté les blocs de l'étagère, visible dans « Écartés »
  await page.goto('/etagere');
  await expect(page.locator('.shelf-block:not(.excluded-block) .box')).toHaveCount(0);
  await expect(page.locator('.excluded-row .box')).toHaveCount(1);

  // Remettre depuis la bibliothèque
  await page.goto('/library');
  const back = page.waitForResponse(async (r) => r.url().includes('/excludes')
    && r.request().method() === 'POST' && (await r.request().postDataJSON())?.excluded === false);
  await page.getByRole('button', { name: /Remettre Biblio au tirage/ }).click();
  await back;
  await expect(page.getByRole('button', { name: /Écarter Biblio du tirage/ })).toBeVisible();
  await page.goto('/etagere');
  await expect(page.locator('.shelf-block:not(.excluded-block) .box')).toHaveCount(1);
  await expect(page.locator('.excluded-row .box')).toHaveCount(0);
});

test('étagère : spinner discret pendant le chargement des pochettes', async ({ browser }) => {
  // SW bloqué : sans ça, il sert les pochettes et la route de test ne voit rien
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  await registerAndStart(page, `spin-${Date.now()}`);
  const res = await page.request.post('/api/games', {
    multipart: {
      title: 'Pochette lente', box_format: 'moyen',
      cover: { name: 'cover.png', mimeType: 'image/png', buffer: makePng(8, 8) },
    },
  });
  if (!res.ok()) throw new Error(`ajout jeu: ${res.status()} ${await res.text()}`);

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
  await registerAndStart(page, `swimg-${Date.now()}`);
  const res = await page.request.post('/api/games', {
    multipart: { title: 'Cache chaud', box_format: 'moyen', cover: { name: 'c.png', mimeType: 'image/png', buffer: makePng(8, 8) } },
  });
  if (!res.ok()) throw new Error(`ajout: ${res.status()}`);

  await page.goto('/etagere'); // 1re visite : remplit le cache du service worker
  await expect(page.locator('.box img.on')).toHaveCount(1);
  await page.goto('/etagere'); // 2e visite : le SW sert la pochette AVANT l'hydratation
  await page.waitForTimeout(800);
  await expect(page.locator('.box img.on')).toHaveCount(1);  // ROUGE : opacity 0 à vie
  await expect(page.locator('.box-spin')).toHaveCount(0);    // ROUGE : spinner infini
});

test('étagère : recherche et filtres (joueurs pré-rempli, complexité, durée)', async ({ page }) => {
  await registerAndStart(page, `flt-${Date.now()}`);
  const add = async (title: string, fmt: string, meta: Record<string, string>) => {
    const f = new FormData();
    f.set('title', title); f.set('box_format', fmt);
    for (const [k, v] of Object.entries(meta)) f.set(k, v);
    const r = await page.request.post('/api/games', { form: f });
    if (!r.ok()) throw new Error(`ajout ${title}: ${r.status()}`);
  };
  await add('Azul', 'moyen', { min_players: '2', max_players: '4', playtime_min: '35', weight: '1.7' });
  await add('Terraforming Mars', 'grand', { min_players: '1', max_players: '5', playtime_min: '120', weight: '3.4' });
  await add('Jaipur', 'petit', { min_players: '2', max_players: '2', playtime_min: '30', weight: '1.5' });
  await page.goto('/etagere');

  // Soirée solo → filtre joueurs pré-rempli à 1 : seul Mars (1–5) reste
  const chip1 = page.locator('.fam[aria-label*="joueurs"] .fchip', { hasText: '1' });
  await expect(chip1).toHaveClass(/on/);
  await expect(page.locator('.shelf-block:not(.excluded-block) .box')).toHaveCount(1);
  await expect(page.locator('.shelf-count')).toContainText('1 jeu sur 3');

  // Désactiver le filtre joueurs → les 3 reviennent
  await chip1.click();
  await expect(page.locator('.shelf-block:not(.excluded-block) .box')).toHaveCount(3);

  // Recherche insensible à la casse
  await page.getByLabel('Rechercher un jeu').fill('azul');
  await expect(page.locator('.shelf-block:not(.excluded-block) .box')).toHaveCount(1);
  await page.getByLabel('Rechercher un jeu').fill('');

  // Complexité lourde → Mars
  await page.getByRole('button', { name: 'Lourde' }).click();
  await expect(page.locator('.shelf-block:not(.excluded-block) .box')).toHaveCount(1);
  await page.getByRole('button', { name: 'Lourde' }).click();

  // Durée 60+ → Mars
  await page.getByRole('button', { name: /60\+ min/ }).click();
  await expect(page.locator('.shelf-block:not(.excluded-block) .box')).toHaveCount(1);
});

test('étagère : badge « apporté par » sur les boîtes', async ({ page }) => {
  const pseudo = `bdg-${Date.now()}`;
  await registerAndStart(page, pseudo);
  // sticker du propriétaire (pas de photo : c'est lui qui doit apparaître)
  await page.request.patch('/api/me', { data: { sticker: '🦊' } });
  const f = new FormData();
  f.set('title', 'Avec badge'); f.set('box_format', 'moyen');
  await page.request.post('/api/games', { form: f });
  await page.goto('/etagere');

  const badge = page.locator('.owner-badge').first();
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute('title', `Apporté par ${pseudo}`);
  await expect(badge).toContainText('🦊');
  expect(await badge.evaluate((el) => getComputedStyle(el).width)).toBe('16px');
});

test('badge : la photo du propriétaire est visible (pas avalée par l’opacité de la pochette)', async ({ page }) => {
  const pseudo = `bdgph-${Date.now()}`;
  await registerAndStart(page, pseudo);
  const png = makePng(4, 4);
  const up = await page.request.post('/api/me/avatar', {
    multipart: { avatar: { name: 'p.png', mimeType: 'image/png', buffer: png } },
  });
  if (!up.ok()) throw new Error(`avatar: ${up.status()}`);
  const f = new FormData();
  f.set('title', 'Avec photo'); f.set('box_format', 'moyen');
  await page.request.post('/api/games', { form: f });
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
