import { test, expect, Page } from '@playwright/test';

// v4.9.0 — notifications push : la carte du profil, les préférences par type, le service worker.
// (L'abonnement réel exige un service de push joignable : couvert en unitaire, envoi simulé.)

async function register(page: Page, pseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const reg = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await reg;
  await page.waitForURL('/etagere');
}

test('profil : proposer d’activer ; bloquées par le navigateur → explication', async ({ browser }) => {
  const s = Date.now().toString(36);
  // Permission pas encore demandée : on propose d'activer. (Chromium headless répond
  // toujours « denied » : l'état « pas encore demandé » est simulé.)
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript(() => Object.defineProperty(Notification, 'permission', { get: () => 'default' }));
  await register(page, `nt_${s}`);
  await page.goto('/profil');
  const carte = page.getByRole('region', { name: 'Notifications' });
  await expect(carte).toContainText('Sois prévenu d’une invitation');
  await expect(carte.getByRole('button', { name: '🔔 Activer les notifications' })).toBeEnabled();
  await ctx.close();

  // Chromium headless refuse les notifications par défaut : c'est le cas « bloquées ».
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await register(page2, `nb_${s}`);
  await page2.goto('/profil');
  const carte2 = page2.getByRole('region', { name: 'Notifications' });
  await expect(carte2).toContainText('Notifications bloquées pour ce site');
  await expect(carte2.getByRole('button', { name: '🔔 Activer les notifications' })).toBeDisabled();
  await ctx2.close();
});

test('préférences par type : tout actif par défaut, un type se coupe', async ({ page }) => {
  await register(page, `np_${Date.now().toString(36)}`);
  const avant = await (await page.request.get('/api/push')).json();
  expect(avant.cle).toMatch(/^[A-Za-z0-9_-]{80,}$/);
  expect(avant.prefs).toEqual({ invitations: true, reponses: true, rappel: true, amis: true });
  expect((await page.request.patch('/api/push', { data: { type: 'rappel', actif: false } })).ok()).toBe(true);
  expect((await page.request.patch('/api/push', { data: { type: 'nimporte', actif: false } })).status()).toBe(400);
  expect((await (await page.request.get('/api/push')).json()).prefs.rappel).toBe(false);
  expect((await page.request.post('/api/push', { data: { subscription: { endpoint: 'http://x' } } })).status()).toBe(400);
});

test('service worker : affiche les notifications et ouvre le bon écran', async ({ request }) => {
  const sw = await (await request.get('/sw.js')).text();
  expect(sw).toContain("addEventListener('push'");
  expect(sw).toContain("addEventListener('notificationclick'");
});
