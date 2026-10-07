import { test, expect, Page } from '@playwright/test';
import { newGame, putOnShelf } from './helpers/shelf';

// v4.12.0 — filtres de contexte : Joueurs / Complexité / Durée bornent la roue.
// « Lancer · N » et l'URL du tirage ne portent que les jeux filtrés ; zéro → bouton désactivé.

async function registerAndStart(page: Page, pseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const reg = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await reg;
  const nightDone = page.waitForResponse((r) => r.url().endsWith('/api/nights') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Créer la partie' }).click();
  const { nightId } = await (await nightDone).json() as { nightId: number };
  await page.waitForURL('/etagere');
  return nightId;
}

test('filtres de contexte : ils bornent la roue, la suggestion « Vous êtes N », zéro → désactivé', async ({ page }) => {
  const nightId = await registerAndStart(page, `ctx_${Date.now()}`);
  const azul = await newGame(page, 'Azul', 'moyen', { min_players: '2', max_players: '4', playtime_min: '45', weight: '1.8' });
  const mars = await newGame(page, 'Terraforming Mars', 'grand', { min_players: '1', max_players: '5', playtime_min: '120', weight: '3.2' });
  const solo = await newGame(page, 'Onirim', 'petit', { min_players: '1', max_players: '1', playtime_min: '15', weight: '1.9' });
  for (const id of [azul, mars, solo]) await putOnShelf(page, id, nightId);
  await page.goto('/etagere');
  await page.getByRole('button', { name: 'Valider ma sélection' }).click();
  await expect(page.locator('.pill-ok')).toContainText('✓ Validée');
  await expect(page.getByRole('button', { name: 'Lancer · 3' })).toBeVisible();

  // Suggestion : on est 1 à jouer (solo) → un tap filtre sur 1 joueur.
  await page.getByRole('button', { name: /Filtres/ }).click();
  await expect(page.locator('.suggest-joueurs')).toContainText('Vous êtes 1 à jouer ce soir');
  await page.getByRole('button', { name: 'Filtrer sur 1 joueur' }).click();
  await expect(page.locator('.suggest-joueurs')).toHaveCount(0);
  // Azul (2–4) sort : la roue ne compte plus que Mars et Onirim.
  await expect(page.getByRole('button', { name: 'Lancer · 2' })).toBeVisible();
  await expect(page.locator('.cta-statut')).toContainText('Filtres actifs : 1 joueur');

  // + Légère : Onirim seul.
  await page.getByRole('button', { name: 'Légère' }).click();
  await expect(page.getByRole('button', { name: 'Lancer · 1' })).toBeVisible();
  await expect(page.locator('.cta-statut')).toContainText('1 joueur · Légère');

  // + 90+ : aucun jeu → bouton désactivé, message.
  await page.getByRole('button', { name: '90+', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Lancer · 0' })).toBeDisabled();
  await expect(page.locator('.cta-statut')).toContainText('Aucun jeu ne correspond aux filtres');

  // On retire 90+ : la roue part avec Onirim seulement.
  await page.getByRole('button', { name: '90+', exact: true }).click();
  await page.getByRole('button', { name: 'Lancer · 1' }).click();
  await page.waitForURL(new RegExp(`/tirage/${nightId}\\?games=${solo}$`));
});
