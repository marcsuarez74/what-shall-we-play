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

test('longue pression → mode sélection, taps = toggle, Terminé sort', async ({ page }) => {
  const pseudo = `lp-${Date.now()}`;
  await registerAndStart(page, pseudo);
  // 3 jeux via l'API (la session navigateur partage les cookies)
  for (const [t, f] of [['Alpha', 'grand'], ['Bravo', 'moyen'], ['Charlie', 'petit']] as const) {
    const form = new FormData();
    form.set('title', t); form.set('box_format', f);
    const res = await page.request.post('/api/games', { form });
    if (!res.ok()) throw new Error(`ajout jeu ${t}: ${res.status()} ${await res.text()}`);
  }
  await page.goto('/etagere');
  const box = page.locator('.box').first();
  await box.scrollIntoViewIfNeeded();

  // Appui simple : la fiche s'ouvre (comportement inchangé)
  await box.click();
  await expect(page.locator('.bottom-sheet')).toBeVisible();
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();

  // Longue pression 400 ms → mode sélection + 1er jeu sélectionné
  const bb = await box.boundingBox();
  await page.mouse.move(bb!.x + bb!.width / 2, bb!.y + bb!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
  await expect(page.locator('.pick-banner')).toBeVisible();
  await expect(page.locator('.chip.selcount')).toContainText('1');

  // Un appui trop court en mode sélection reste un toggle (pas une fiche)
  await page.locator('.box').nth(1).click();
  await expect(page.locator('.chip.selcount')).toContainText('2');
  await page.locator('.box').nth(1).click();
  await expect(page.locator('.chip.selcount')).toContainText('1');

  // Terminé → sortie du mode ; l'appui simple rouvre la fiche
  await page.getByRole('button', { name: 'Terminé' }).click();
  await expect(page.locator('.pick-banner')).toHaveCount(0);
  await box.click();
  await expect(page.locator('.bottom-sheet')).toBeVisible();
});
