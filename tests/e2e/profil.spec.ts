import { test, expect } from '@playwright/test';

async function registerAndStart(page: import('@playwright/test').Page, pseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const reg = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await reg;
  // Première connexion : on crée la soirée (pré-cochée) — on attend la fin du POST
  const nightDone = page.waitForResponse((r) => r.url().endsWith('/api/nights') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Créer la soirée' }).click();
  await nightDone;
  await page.waitForURL('/etagere');
}

test('profil : sticker choisi visible sur l avatar et dans les chips', async ({ page }) => {
  const pseudo = `prof-${Date.now()}`;
  await registerAndStart(page, pseudo);

  await page.goto('/profil');
  await expect(page.getByText('parties jouées')).toBeVisible();
  await page.getByRole('button', { name: "Changer d'avatar" }).click();
  await page.getByRole('dialog', { name: 'Choisir un sticker' }).getByRole('button', { name: '🦊' }).click();
  await expect(page.locator('.avatar')).toContainText('🦊');

  // Le sticker remplace le dé dans les chips de l'étagère
  await page.goto('/etagere');
  await expect(page.locator('.chip', { hasText: pseudo })).toContainText('🦊');
  // Menu utilisateur : lien Mon profil présent
  await page.getByLabel('Menu utilisateur').click();
  await expect(page.getByRole('link', { name: 'Mon profil' })).toBeVisible();
});

test('profil : changement de code effectif', async ({ page }) => {
  const pseudo = `code-${Date.now()}`;
  await registerAndStart(page, pseudo);

  await page.goto('/profil');
  await page.getByRole('button', { name: /Changer mon code/ }).click();
  const dlg = page.getByRole('dialog', { name: 'Changer mon code' });
  await dlg.getByLabel('Code actuel').fill('1234');
  await dlg.getByRole('button', { name: 'Continuer' }).click();
  await dlg.getByLabel('Nouveau code').fill('5678');
  await dlg.getByRole('button', { name: 'Continuer' }).click();
  await dlg.getByLabel('Confirmer le nouveau code').fill('5678');
  await dlg.getByRole('button', { name: 'Enregistrer le nouveau code' }).click();
  await expect(dlg.getByText('Code enregistré ✓')).toBeVisible();

  // Reconnexion avec le nouveau code
  await page.goto('/etagere');
  await page.getByLabel('Menu utilisateur').click();
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await page.waitForURL('/login');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('5678');
  const login = page.waitForResponse((r) => r.url().endsWith('/api/auth/login'));
  await page.getByRole('button', { name: 'Entrer' }).click();
  await login;
  await page.waitForURL('/etagere');
});

test('profil : suppression du compte puis connexion impossible', async ({ page }) => {
  const pseudo = `del-${Date.now()}`;
  await registerAndStart(page, pseudo);

  await page.goto('/profil');
  await page.getByRole('button', { name: /Supprimer mon profil/ }).click();
  const dlg = page.getByRole('dialog', { name: 'Supprimer mon profil' });
  await expect(dlg.getByText(/quittent l'app/)).toBeVisible();
  await dlg.getByLabel('Code secret').fill('1234');  const del = page.waitForResponse((r) => r.url().endsWith('/api/me') && r.request().method() === 'DELETE');
  await dlg.getByRole('button', { name: 'Supprimer définitivement' }).click();
  await del;
  await page.waitForURL('/register');

  await page.goto('/login');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const login = page.waitForResponse((r) => r.url().endsWith('/api/auth/login'));
  await page.getByRole('button', { name: 'Entrer' }).click();
  const res = await login;
  expect(res.status()).toBe(401);
  await expect(page.locator('.auth-form .error')).toContainText('Identifiants incorrects');
});
