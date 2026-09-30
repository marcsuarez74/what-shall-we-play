import { test, expect } from '@playwright/test';

// QG Soirées : programmation (date + heure + joueurs), sections Ce soir / Programmées / Historique.
// Le jour J, la programmée devient la soirée en cours automatiquement (aucun état à muter).

async function register(page: import('@playwright/test').Page, pseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const reg = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await reg;
}

/** Second compte SANS écraser la session du navigateur (contexte API séparé). */
async function registerOther(page: import('@playwright/test').Page, pseudo: string) {
  const other = await page.context().browser()!.newContext();
  await other.request.post('/api/auth/register', { data: { pseudo, code: '1234' } });
  await other.close();
}

test('soirées : programmer pour demain → carte dans Programmées, étagère intacte', async ({ page }) => {
  const s = Date.now().toString(36);
  await register(page, `soir-${s}`);
  await registerOther(page, `inv-${s}`);

  await page.goto('/nights');
  await page.getByRole('button', { name: 'Programmer une soirée' }).click();
  const demain = new Date(Date.now() + 86_400_000).toLocaleDateString('sv-SE');
  await page.getByLabel('Date').fill(demain);
  await page.getByLabel('Heure').fill('20:00');
  await page.locator('.player-list label', { hasText: `inv-${s}` }).locator('input').check();
  const post = page.waitForResponse((r) => r.url().endsWith('/api/nights') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Programmer', exact: true }).click();
  await post;

  const card = page.locator('.planned-card').first();
  await expect(card).toBeVisible();
  await expect(card).toContainText('20:00');
  await expect(card).toContainText(`inv-${s}`); // chips des joueurs invités

  // La programmée n'est PAS la nuit active : l'étagère reste à l'état vide
  await page.goto('/etagere');
  await expect(page.getByRole('button', { name: 'Créer la soirée' })).toBeVisible();
});

test('jour J : une soirée datée d aujourd hui devient la nuit active', async ({ page }) => {
  const s = Date.now().toString(36);
  await register(page, `jj-${s}`);
  // Créée « le jour même » (API, playedAt par défaut = aujourd hui)
  await page.request.post('/api/nights', { data: { playerIds: [] } });
  await page.goto('/etagere');
  await expect(page.locator('.night-card')).toBeVisible(); // soirée en cours, pas le picker
  await expect(page.getByRole('button', { name: 'Créer la soirée' })).toHaveCount(0);
});

// ——— Annonces WhatsApp (Task 11) ———

/** Setup tirage à 2 joueurs : marc (créateur, propriétaire du jeu) + léa. */
async function setupTirage(page: import('@playwright/test').Page, s: string) {
  await register(page, `ann-${s}`); // marc
  await registerOther(page, `lea-${s}`);
  await page.goto('/games/add');
  await page.getByLabel('Titre du jeu').fill('Cascadia');
  await page.getByRole('button', { name: 'Saisir à la main' }).click();
  await page.getByRole('button', { name: 'Ajouter à la ludothèque' }).click();
  await page.locator('.player-list label', { hasText: `lea-${s}` }).locator('input').check();
  const post = page.waitForResponse((r) => r.url().endsWith('/api/nights') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Créer la soirée' }).click();
  await post;
  await page.locator('.box').first().click();
  await page.getByRole('button', { name: /Ajouter à la sélection/ }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Lancer le tirage · 1' }).click();
  await expect(page.getByText('LA ROUE A PARLÉ')).toBeVisible({ timeout: 10_000 });
}

test('verdict : « Annoncer sur WhatsApp » partage le bon message (partage natif)', async ({ page }) => {
  await page.addInitScript(() => {
    const calls: unknown[] = [];
    (window as unknown as { __share: unknown[] }).__share = calls;
    Object.defineProperty(navigator, 'share', {
      value: (data: { text?: string }) => { calls.push(data); return Promise.resolve(); },
      configurable: true,
    });
  });
  const s = Date.now().toString(36);
  await setupTirage(page, s);
  await page.getByRole('button', { name: /Annoncer sur WhatsApp/ }).click();
  const text = await page.evaluate(() => {
    const calls = (window as unknown as { __share: { text?: string }[] }).__share;
    return calls[0]?.text ?? '';
  });
  expect(text).toContain('🎲 Cascadia a été tiré au sort !');
  expect(text).toContain(`👉 ann-${s} ramène son jeu`); // le propriétaire
  expect(text).toContain(`On attend lea-${s}`);         // les participants sauf le propriétaire
  expect(text).not.toContain('ce soir à');              // pas d'heure sur cette soirée
});

test('verdict : fallback wa.me quand le partage natif est absent', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });
  const s = Date.now().toString(36);
  await setupTirage(page, s);
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: /Annoncer sur WhatsApp/ }).click();
  const popup = await popupPromise;
  // wa.me redirige vers api.whatsapp.com : on asserte le contrat, pas l'hôte final
  // (+ = espace en form-encoding après la redirection WhatsApp)
  expect(popup.url()).toContain('text=');
  expect(decodeURIComponent(popup.url()).replace(/\+/g, ' ')).toContain('Cascadia a été tiré au sort');
});

test('programmée : « Inviter sur WhatsApp » avec date longue, heure et joueurs', async ({ page }) => {
  await page.addInitScript(() => {
    const calls: unknown[] = [];
    (window as unknown as { __share: unknown[] }).__share = calls;
    Object.defineProperty(navigator, 'share', {
      value: (data: { text?: string }) => { calls.push(data); return Promise.resolve(); },
      configurable: true,
    });
  });
  const s = Date.now().toString(36);
  await register(page, `inv-btn-${s}`);
  await registerOther(page, `thib-${s}`);

  await page.goto('/nights');
  await page.getByRole('button', { name: 'Programmer une soirée' }).click();
  const demain = new Date(Date.now() + 86_400_000);
  await page.getByLabel('Date').fill(demain.toLocaleDateString('sv-SE'));
  await page.getByLabel('Heure').fill('20:00');
  await page.locator('.player-list label', { hasText: `thib-${s}` }).locator('input').check();
  const post = page.waitForResponse((r) => r.url().endsWith('/api/nights') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Programmer', exact: true }).click();
  await post;

  await page.locator('.planned-card').first().getByRole('button', { name: /Inviter sur WhatsApp/ }).click();
  const text = await page.evaluate(() => {
    const calls = (window as unknown as { __share: { text?: string }[] }).__share;
    return calls[0]?.text ?? '';
  });
  const dateLong = demain.toLocaleDateString('fr-FR', { dateStyle: 'long' });
  expect(text).toContain(`🎲 Soirée jeux le ${dateLong} à 20:00 !`);
  expect(text).toContain(`inv-btn-${s}`); // créateur listé
  expect(text).toContain(`thib-${s}`);    // invité listé
});
