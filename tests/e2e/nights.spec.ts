import { test, expect } from '@playwright/test';

test('soirées : historique avec date, joueurs et tirages', async ({ page }) => {
  const pseudo = `nights-${Date.now()}`; // 20 caractères exactement (limite d'inscription)

  // Compte neuf (pattern Task 11)
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const registerDone = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await registerDone; // sinon le goto suivant peut interrompre le POST avant le cookie

  // Un seul jeu dans la bibliothèque (formulaire manuel, sans BGG) —
  // l'application ramène sur l'étagère après l'ajout
  await page.goto('/games/add');
  await page.getByLabel('Titre du jeu').fill('Azul');
  await page.getByRole('button', { name: 'Saisir à la main' }).click();
  await page.getByRole('button', { name: 'Ajouter à la ludothèque' }).click();

  // Soirée via le sélecteur (affiché sur l'étagère tant qu'il n'y a pas de soirée
  // en cours ; créateur déjà pré-coché, on crée directement)
  await page.getByRole('button', { name: 'Créer la soirée' }).click();

  // Étagère : boîte → fiche → « Ajouter à la sélection » → Escape → tirage
  await page.locator('.box').first().click();
  await page.getByRole('button', { name: /Ajouter à la sélection/ }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Lancer le tirage · 1' }).click();
  await expect(page.getByText('LA ROUE A PARLÉ')).toBeVisible({ timeout: 10_000 });

  // Historique : accessible depuis le menu utilisateur de l'étagère
  await page.goto('/etagere');
  await page.getByLabel('Menu utilisateur').click();
  await page.getByRole('link', { name: 'Soirées' }).click();

  // La soirée du jour : date fr-FR, puce joueur, tirage (titre + qui a lancé)
  await expect(page.getByRole('heading', { name: 'Mes soirées' })).toBeVisible();
  await expect(page.locator('.night-card')).toHaveCount(1);
  await expect(page.locator('.night-date').first()).toContainText(
    /\d{1,2}\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+\d{4}/);
  await expect(page.locator('.night-card .chips')).toContainText(pseudo);
  await expect(page.locator('.night-picks')).toContainText('Azul');
  await expect(page.locator('.night-picks')).toContainText(`tiré par ${pseudo}`);
});

test('soirées : écran vide pour un nouveau compte', async ({ page }) => {
  // Pseudo ≤ 20 caractères (limite d'inscription) : suffixe compact en base 36
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(`nights-e-${Date.now().toString(36)}`);
  await page.getByLabel('Code secret').fill('1234');
  const registerDone = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await registerDone;

  // Aucune soirée : le texte vide exact, avec un lien vers l'étagère
  await page.goto('/nights');
  await expect(page.getByRole('heading', { name: 'Mes soirées' })).toBeVisible();
  await expect(page.locator('.empty')).toHaveText(
    "Aucune soirée pour l'instant. Lancez votre première depuis l'étagère.");
  await expect(page.locator('.empty a')).toHaveAttribute('href', '/etagere');
});
