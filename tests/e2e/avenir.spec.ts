import { test, expect } from '@playwright/test';

// v4.21.0 — Parties à venir sur l'étagère (accueil) : les 2 prochaines + « Voir tout »,
// puis, une fois une partie du jour lancée, la ligne « Ensuite : » vers la suivante.

/** YYYY-MM-DD local dans n jours — arithmétique calendaire (sûr pendant le DST). */
const jour = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv-SE');
};

test('étagère : parties à venir, ouverture d une partie future, rappel « Ensuite »', async ({ page }) => {
  const s = Date.now().toString(36);
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(`av_${s}`);
  await page.getByLabel('Code secret').fill('1234');
  const reg = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await reg;

  const programmer = (data: Record<string, unknown>) =>
    page.request.post('/api/nights', { data: { playerIds: [], ...data } });
  await programmer({ playedAt: jour(1), startTime: '20:30', titre: 'Soirée Catan' });
  await programmer({ playedAt: jour(4) });
  await programmer({ playedAt: jour(8), titre: 'Marathon' });

  // Pas de partie aujourd'hui : bloc « À venir » (2 cartes) au-dessus de la création
  await page.goto('/etagere');
  const bloc = page.getByRole('region', { name: 'À venir' });
  await expect(bloc.locator('.av-card')).toHaveCount(2);
  await expect(bloc.locator('.av-card').first()).toContainText('Soirée Catan');
  await expect(bloc.locator('.av-card').first()).toContainText('Demain');
  await expect(bloc.locator('.av-card').nth(1)).toContainText(`Partie de av_${s}`);
  await expect(bloc).not.toContainText('Marathon');
  await expect(page.getByRole('button', { name: 'Créer la partie' })).toBeVisible();

  // Une carte ouvre l'étagère de cette partie (tirage fermé jusqu'au jour J)
  await bloc.locator('.av-card').first().click();
  await expect(page).toHaveURL(/\/etagere\?night=\d+/);
  await expect(page.locator('.nc-titre')).toHaveText('Soirée Catan');
  await expect(page.getByRole('link', { name: '← Parties' })).toBeVisible();

  // « Voir tout (3) › » mène à Parties
  await page.goto('/etagere');
  await page.getByRole('link', { name: 'Voir tout (3) ›' }).click();
  await expect(page).toHaveURL(/\/nights$/);

  // Partie du jour : l'étagère du jour, avec la ligne « Ensuite : » vers la prochaine
  await programmer({});
  await page.goto('/etagere');
  await expect(page.getByRole('region', { name: 'À venir' })).toHaveCount(0);
  const ensuite = page.locator('.ensuite');
  await expect(ensuite).toContainText('Soirée Catan');
  await ensuite.click();
  await expect(page.locator('.nc-titre')).toHaveText('Soirée Catan');
  await expect(page.locator('.ensuite')).toHaveCount(0); // pas sur l'étagère d'une partie future
});
