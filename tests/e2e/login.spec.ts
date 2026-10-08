import { test, expect } from '@playwright/test';
import { passerBienvenue } from './helpers/inscription';

// Page de connexion publique — attribution BGG demandée par le client (v4.4.0).
test('login : attribution « Powered by BoardGameGeek » visible', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('.auth-form img.auth-bgg')).toBeVisible();
  await expect(page.locator('.auth-form img.auth-bgg')).toHaveAttribute('alt', 'Powered by BoardGameGeek');
});

// v4.5.0 : « Se souvenir de moi » + restauration d'appareil — les PWA peuvent
// perdre leur cookie à la mort de l'app ; le jeton en localStorage rétablit la
// session silencieusement au retour sur /login.
test('login : la session survit à la perte du cookie (jeton d\'appareil)', async ({ page, context }) => {
  const stamp = Date.now().toString(36);
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(`souviens${stamp}`);
  await page.getByLabel('Code secret').fill('1234');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await passerBienvenue(page);

  // Déconnexion explicite : session ET jeton purgés
  await page.locator('.user-chip summary').click();
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await page.waitForURL('**/login');
  expect(await page.evaluate(() => localStorage.getItem('wsp_device_token'))).toBeNull();

  // Reconnexion, case « Se souvenir de moi » cochée par défaut
  await page.getByLabel('Pseudo').fill(`souviens${stamp}`);
  await page.getByLabel('Code secret').fill('1234');
  await expect(page.locator('.remember input')).toBeChecked();
  await page.getByRole('button', { name: 'Entrer' }).click();
  await page.waitForURL('**/etagere');
  const token = await page.evaluate(() => localStorage.getItem('wsp_device_token'));
  expect(token).toBeTruthy();

  // La PWA perd son cookie mais garde le localStorage → retour sur /login :
  // la restauration silencieuse remet la session sans saisie.
  await context.clearCookies();
  await page.goto('/login');
  await page.waitForURL('**/etagere');
  await expect(page.locator('.user-chip')).toBeVisible();
  // le jeton a tourné (rotation à chaque restauration)
  expect(await page.evaluate(() => localStorage.getItem('wsp_device_token'))).not.toBe(token);
});

// v4.7.2 (audit) : 5 échecs sur un pseudo → « Trop de tentatives », même avec le
// bon code ensuite (le blocage dure la fenêtre de 15 min).
test('login : trop de tentatives → blocage temporaire du pseudo', async ({ page }) => {
  const p = `brute_${Date.now().toString(36)}`;
  await page.request.post('/api/auth/register', { data: { pseudo: p, code: '1234' } });
  for (let i = 0; i < 5; i++) {
    const r = await page.request.post('/api/auth/login', { data: { pseudo: p, code: '0000' } });
    expect(r.status()).toBe(401);
  }
  await page.goto('/login');
  await page.getByLabel('Pseudo').fill(p);
  await page.getByLabel('Code secret').fill('1234');
  await page.getByRole('button', { name: 'Entrer' }).click();
  await expect(page.getByText(/Trop de tentatives : réessaie dans \d+ min\./)).toBeVisible();
});
