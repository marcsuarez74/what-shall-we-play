import { test, expect } from '@playwright/test';
import { gameIdByTitle, putOnShelf } from './helpers/shelf';

test('tirage : roue plein écran puis verdict sur le jeu tiré', async ({ page }) => {
  // Compte neuf
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(`tirage-${Date.now()}`);
  await page.getByLabel('Code secret').fill('1234');
  const registerDone = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await registerDone; // sinon le goto suivant peut interrompre le POST avant le cookie

  // Un seul jeu dans la bibliothèque (formulaire manuel, sans BGG)
  await page.goto('/games/add');
  await page.getByLabel('Titre du jeu').fill('Cascadia');
  await page.getByRole('button', { name: 'Saisir à la main' }).click();
  await page.getByRole('button', { name: 'Ajouter à la ludothèque' }).click();

  // Soirée via le sélecteur (affiché sur l'étagère tant qu'il n'y a pas de soirée en cours ;
  // créateur déjà pré-coché — on ne coche jamais une autre case : elle appartient à un autre compte)
  await page.getByRole('button', { name: 'Créer la partie' }).click();

  // Étagère vide à la création (v3) : le joueur pose Cascadia depuis sa ludothèque
  await putOnShelf(page, await gameIdByTitle(page, 'Cascadia'));
  await page.goto('/etagere');

  // v3.0.0 : valider sa sélection puis lancer
  await page.getByRole('button', { name: 'Valider ma sélection' }).click();
  await expect(page.locator('.pill-ok')).toContainText('✓ Validée'); // la validation est enregistrée avant de cliquer
  await page.getByRole('button', { name: 'Lancer · 1' }).click();

  // La roue tourne (~3,5 s) puis le verdict tombe
  await expect(page.getByText('LA ROUE A PARLÉ')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('heading', { name: 'Cascadia' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sortir la boîte 📦' })).toBeVisible();
  await page.getByRole('button', { name: 'Sortir la boîte 📦' }).click();
  await expect(page.getByRole('button', { name: 'Boîte sortie ✓' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Relancer le tirage' })).toBeVisible();

  // Relance : la roue repart, un second verdict tombe
  await page.getByRole('button', { name: 'Relancer le tirage' }).click();
  await expect(page.getByText('LA ROUE A PARLÉ')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('heading', { name: 'Cascadia' })).toBeVisible();
});
