import { test, expect } from '@playwright/test';
import { gameIdByTitle, putOnShelf } from './helpers/shelf';

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

/** YYYY-MM-DD local de demain — arithmétique calendaire (sûr pendant le DST). */
const demain = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('sv-SE');
};

test('soirées : programmer pour demain → carte dans Programmées, étagère intacte', async ({ page }) => {
  const s = Date.now().toString(36);
  await register(page, `soir_${s}`);
  await registerOther(page, `inv_${s}`);

  await page.goto('/nights');
  await page.getByRole('button', { name: 'Programmer une partie' }).click();
  await page.getByLabel('Date').fill(demain());
  await page.getByLabel('Heure').fill('20:00');
  await page.locator('.player-list label', { hasText: `inv_${s}` }).locator('input').check();
  const post = page.waitForResponse((r) => r.url().endsWith('/api/nights') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Programmer', exact: true }).click();
  await post;

  const card = page.locator('.planned-card').first();
  await expect(card).toBeVisible();
  await expect(card).toContainText('20:00');
  await expect(card).toContainText(`inv_${s}`); // chips des joueurs invités

  // La programmée n'est PAS la nuit active : l'étagère reste à l'état vide
  await page.goto('/etagere');
  await expect(page.getByRole('button', { name: 'Créer la partie' })).toBeVisible();
});

test('jour J : une soirée datée d aujourd hui devient la nuit active', async ({ page }) => {
  const s = Date.now().toString(36);
  await register(page, `jj_${s}`);
  // Créée « le jour même » (API, playedAt par défaut = aujourd hui)
  await page.request.post('/api/nights', { data: { playerIds: [] } });
  await page.goto('/etagere');
  await expect(page.locator('.night-card')).toBeVisible(); // soirée en cours, pas le picker
  await expect(page.getByRole('button', { name: 'Créer la partie' })).toHaveCount(0);
});

test('API : date ou heure invalide rejetée, le QG reste sain', async ({ page }) => {
  await register(page, `val_${Date.now().toString(36)}`);
  // Date calendairement invalide (le regex seul la laisserait passer)
  const badDate = await page.request.post('/api/nights', { data: { playerIds: [], playedAt: '2026-10-32' } });
  expect(badDate.status()).toBe(400);
  // Heure hors bornes (le regex seul la laisserait passer)
  const badTime = await page.request.post('/api/nights', { data: { playerIds: [], startTime: '24:99' } });
  expect(badTime.status()).toBe(400);
  // Le QG ne casse pas (le jeu invalide n a pas été créé)
  await page.goto('/nights');
  await expect(page.getByRole('heading', { name: 'Mes parties' })).toBeVisible();
});

// ——— Annonces WhatsApp (Task 11) ———

/** Setup tirage à 2 joueurs : marc (créateur, propriétaire du jeu) + léa. */
async function setupTirage(page: import('@playwright/test').Page, s: string) {
  await register(page, `ann_${s}`); // marc
  await registerOther(page, `lea_${s}`);
  await page.goto('/games/add');
  await page.getByLabel('Titre du jeu').fill('Cascadia');
  await page.getByRole('button', { name: 'Saisir à la main' }).click();
  await page.getByRole('button', { name: 'Ajouter à la ludothèque' }).click();
  await page.locator('.player-list label', { hasText: `lea_${s}` }).locator('input').check();
  const post = page.waitForResponse((r) => r.url().endsWith('/api/nights') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Créer la partie' }).click();
  await post;
  // Étagère vide à la création (v3) : marc pose Cascadia depuis sa ludothèque
  await putOnShelf(page, await gameIdByTitle(page, 'Cascadia'));
  await page.goto('/etagere');
  // v3.0.0 : marc valide puis lance — léa n'a pas validé : double-appui « Sûr ? »
  await page.getByRole('button', { name: 'Valider ma sélection' }).click();
  const lancer = page.getByRole('button', { name: /Lancer · 1|Sûr \? Lancer/ });
  await lancer.click(); // 1/2 prêts → demande de confirmation
  // Flake CI (v3.3.1) : un refresh du sync live qui tombe entre mousedown et
  // mouseup peut échanger le nœud — le clic part, la navigation non. On relance
  // le clic tant qu'on n'est pas sur l'écran du tirage (3 essais max).
  await expect(lancer).toHaveAccessibleName(/Sûr \? Lancer/);
  await lancer.click(); // « Sûr ? Lancer » → on lance quand même
  let surTirage = false;
  for (let essai = 0; essai < 3 && !surTirage; essai++) {
    try {
      await page.waitForURL('**/tirage/**', { timeout: 8_000 });
      surTirage = true;
    } catch {
      if (essai === 2) throw new Error('Le lancement n\u2019a jamais navigué vers le tirage');
      await expect(lancer).toBeVisible(); // encore armé : ce clic part directement
      await lancer.click();
    }
  }
  await expect(page.getByText('UNE SEULE BOÎTE EN LICE')).toBeVisible({ timeout: 20_000 });
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
  expect(text).toContain(`👉 ann_${s} ramène son jeu`); // le propriétaire
  expect(text).toContain(`On attend lea_${s}`);         // les participants sauf le propriétaire
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
  await register(page, `inv_btn_${s}`);
  await registerOther(page, `thib_${s}`);

  await page.goto('/nights');
  await page.getByRole('button', { name: 'Programmer une partie' }).click();
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const dateLong = d.toLocaleDateString('fr-FR', { dateStyle: 'long' });
  await page.getByLabel('Date').fill(d.toLocaleDateString('sv-SE'));
  await page.getByLabel('Heure').fill('20:00');
  await page.locator('.player-list label', { hasText: `thib_${s}` }).locator('input').check();
  const post = page.waitForResponse((r) => r.url().endsWith('/api/nights') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Programmer', exact: true }).click();
  await post;

  await page.locator('.planned-card').first().getByRole('button', { name: /Inviter sur WhatsApp/ }).click();
  const text = await page.evaluate(() => {
    const calls = (window as unknown as { __share: { text?: string }[] }).__share;
    return calls[0]?.text ?? '';
  });
  expect(text).toContain(`🎲 Partie de jeux le ${dateLong} à 20:00 !`);
  expect(text).toContain(`inv_btn_${s}`); // créateur listé
  expect(text).toContain(`thib_${s}`);    // invité listé
});

test('terminer la soirée : étagère vidée, nuit conservée en historique', async ({ page }) => {
  await register(page, `fin_${Date.now().toString(36)}`);
  await page.request.post('http://localhost:3000/api/nights', { data: { playerIds: [] } });
  await page.goto('/etagere');
  await expect(page.locator('.night-card')).toBeVisible();

  // Double-tap de confirmation dans le QG
  await page.goto('/nights');
  await page.getByRole('button', { name: 'Terminer la partie' }).click();
  const endPost = page.waitForResponse((r) => r.url().includes('/end') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Sûr ? Terminer' }).click();
  await endPost;

  // « Ce soir » est vide, la nuit est dans l'historique
  await expect(page.locator('[aria-label="Aujourd\'hui"] .empty')).toBeVisible();
  await expect(page.locator('[aria-label="Historique"] .hist-card')).toHaveCount(1);

  // L'étagère revient à l'état vierge
  await page.goto('/etagere');
  await expect(page.getByRole('button', { name: 'Créer la partie' })).toBeVisible();
});
