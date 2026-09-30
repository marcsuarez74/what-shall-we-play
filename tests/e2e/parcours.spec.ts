import { test, expect } from '@playwright/test';

// Stamp base 36 : « parc-marc- » + 8 caractères ≤ limite d'inscription (20)
const stamp = Date.now().toString(36);

test('parcours complet : deux joueurs, sélection, tirage, historique', async ({ browser }) => {
  const ctxA = await browser.newContext(); const a = await ctxA.newPage();
  await a.goto('/register');
  await a.getByLabel('Pseudo').fill(`parc-marc-${stamp}`);
  await a.getByLabel('Code secret').fill('1234');
  const registerMarc = a.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await a.getByRole('button', { name: 'Créer mon compte' }).click();
  await registerMarc; // sinon le goto suivant peut interrompre le POST avant le cookie

  // Marc ajoute un jeu SANS pochette (Review Focus n°1 : placeholder ♟)
  await a.goto('/games/add');
  await a.getByLabel('Titre').fill('Terraforming Mars');
  await a.getByLabel('Format de boîte').selectOption('grand');
  await a.getByRole('button', { name: 'Ajouter à ma bibliothèque' }).click();

  // Léa s'inscrit et ajoute son jeu
  const ctxB = await browser.newContext(); const b = await ctxB.newPage();
  await b.goto('/register');
  await b.getByLabel('Pseudo').fill(`parc-lea-${stamp}`);
  await b.getByLabel('Code secret').fill('1234');
  const registerLea = b.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await b.getByRole('button', { name: 'Créer mon compte' }).click();
  await registerLea; // sinon le goto suivant peut interrompre le POST avant le cookie
  await b.goto('/games/add');
  await b.getByLabel('Titre').fill('Harmonies');
  await b.getByLabel('Format de boîte').selectOption('petit');
  await b.getByRole('button', { name: 'Ajouter à ma bibliothèque' }).click();

  // Marc crée la soirée avec Léa
  await a.goto('/etagere');
  await a.getByLabel(new RegExp(`parc-lea-${stamp}`)).check();
  await a.getByRole('button', { name: /Créer la soirée/ }).click();

  // Les deux bibliothèques sont sur l'étagère ; sélection + tirage
  await expect(a.locator('.box')).toHaveCount(2);
  await a.locator('.box').nth(0).click();
  await a.getByRole('button', { name: /Ajouter à la sélection/ }).click();
  await a.keyboard.press('Escape');
  await a.locator('.box').nth(1).click();
  await a.getByRole('button', { name: /Ajouter à la sélection/ }).click();
  await a.keyboard.press('Escape');
  await a.getByRole('button', { name: /Lancer le tirage · 2/ }).click();
  await expect(a.getByText('LA ROUE A PARLÉ')).toBeVisible({ timeout: 10_000 });

  // Historique
  await a.goto('/nights');
  await expect(a.getByText(/Terraforming Mars|Harmonies/)).toBeVisible();
});
