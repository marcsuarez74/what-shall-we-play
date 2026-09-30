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

test('soirées : programmer pour demain → carte dans Programmées, étagère intacte', async ({ page }) => {
  const s = Date.now().toString(36);
  await register(page, `soir-${s}`);
  await page.request.post('/api/auth/register', { data: { pseudo: `inv-${s}`, code: '1234' } });

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
