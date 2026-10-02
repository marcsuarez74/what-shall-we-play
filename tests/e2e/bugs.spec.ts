import { test, expect, Page } from '@playwright/test';

// Aide locale : inscription via l'UI (pseudos ≤ 20 caractères — ruling v3.2).
async function register(page: Page, pseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const reg = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await reg;
}

test('menu : « Rapporter un bug » présent et mène à /bugs', async ({ page }) => {
  await register(page, `menu-${Date.now().toString(36)}`);
  await page.goto('/etagere');
  await page.locator('.user-chip summary').click();
  const lien = page.getByRole('link', { name: /Rapporter un bug/ });
  await expect(lien).toBeVisible();
  await lien.click();
  await page.waitForURL('**/bugs**');
});

test('rapport : infos visibles, bouton verrouillé tant que c\u2019est incomplet, 503 propre sans jeton', async ({ page }) => {
  await register(page, `bug-${Date.now().toString(36)}`);
  await page.goto('/bugs');
  await expect(page.getByRole('heading', { name: 'Rapporter un bug' })).toBeVisible();
  // transparence : les infos techniques sont affichées avant l'envoi
  await expect(page.locator('.bug-infos')).toContainText(/v\d+\.\d+\.\d+/);
  await expect(page.locator('.bug-infos')).toContainText('Page');
  // bouton verrouillé tant que titre/description ne passent pas
  const titre = page.getByLabel('Titre');
  const description = page.getByLabel('Description');
  await titre.fill('ab');
  await description.fill('Une description suffisamment longue pour le test.');
  await expect(page.getByRole('button', { name: /Envoyer le signalement/ })).toBeDisabled();
  // bascule de type : le libellé suit
  await page.getByRole('button', { name: /Amélioration/ }).click();
  await expect(page.getByRole('button', { name: /Proposer l\u2019amélioration/ })).toBeDisabled();
  await page.getByRole('button', { name: /Bug/ }).click();
  // titre valide → déverrouillé → envoi → sans jeton en CI : 503 affiché proprement
  await titre.fill('La roue reste bloquée');
  const bouton = page.getByRole('button', { name: /Envoyer le signalement/ });
  await expect(bouton).toBeEnabled();
  await bouton.click();
  await expect(page.locator('.error')).toContainText('Signalement indisponible');
});

test('rapport : capture jointe avec aperçu et retrait', async ({ page }) => {
  await register(page, `cap-${Date.now().toString(36)}`);
  await page.goto('/bugs');
  // « joindre » : input file caché piloté par le bouton — on charge une vraie image
  await page.locator('input[type=file]').setInputFiles({
    name: 'capture.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex'),
  });
  await expect(page.locator('.bug-apercu')).toBeVisible();
  await page.getByRole('button', { name: 'retirer' }).click();
  await expect(page.locator('.bug-apercu')).toHaveCount(0);
});
