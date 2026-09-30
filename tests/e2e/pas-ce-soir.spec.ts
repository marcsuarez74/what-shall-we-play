import { test, expect } from '@playwright/test';

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
