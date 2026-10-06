import { test, expect } from '@playwright/test';
import { gameIdByTitle, putOnShelf } from './helpers/shelf';

test('soirées : historique avec date, joueurs et tirages', async ({ page }) => {
  const pseudo = `nights_${Date.now()}`; // 20 caractères exactement (limite d'inscription)

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
  await page.getByRole('button', { name: 'Créer la partie' }).click();

  // Étagère vide à la création (v3) : Marc pose Azul, sa ludothèque est la sienne
  await putOnShelf(page, await gameIdByTitle(page, 'Azul'));
  await page.goto('/etagere');

  // v3.0.0 : le créateur valide sa sélection puis lance (solo = tout le monde est prêt)
  await page.getByRole('button', { name: 'Valider ma sélection' }).click();
  await expect(page.locator('.pill-ok')).toContainText('✓ Validée'); // la validation est enregistrée avant de cliquer
  await page.getByRole('button', { name: 'Lancer · 1' }).click();
  await expect(page.getByText('UNE SEULE BOÎTE EN LICE')).toBeVisible({ timeout: 10_000 });

  // Historique : accessible depuis la barre d'onglets
  await page.goto('/etagere');
  await page.getByRole('link', { name: 'Parties' }).click();

  // La soirée du jour : section « Ce soir » (badge d'état) ; l'historique reste vide
  await expect(page.getByRole('heading', { name: 'Mes parties' })).toBeVisible();
  await expect(page.locator('.night-card')).toHaveCount(1); // Ce soir seulement
  // v3.3.0 : la carte « Ce soir » porte un badge d'état ; les picks cumulés ne
  // s'affichent plus (le jeu de la partie vit sur la boîte sortie, nights.game_id)
  await expect(page.locator('[aria-label="Aujourd\'hui"] .badge-etat')).toContainText('En préparation');
  await expect(page.locator('[aria-label="Aujourd\'hui"] .chips')).toContainText(pseudo);
  await expect(page.locator('.night-picks')).toHaveCount(0);
  await expect(page.locator('[aria-label="Historique"] .hint')).toContainText('Aucune partie terminée');
});

test('soirées : écran vide pour un nouveau compte', async ({ page }) => {
  // Pseudo ≤ 20 caractères (limite d'inscription) : suffixe compact en base 36
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(`nights_e_${Date.now().toString(36)}`);
  await page.getByLabel('Code secret').fill('1234');
  const registerDone = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await registerDone;

  // QG à trois sections, chacune avec son état vide ; lien vers l'étagère
  await page.goto('/nights');
  await expect(page.getByRole('heading', { name: 'Mes parties' })).toBeVisible();
  await expect(page.locator('[aria-label="Aujourd\'hui"] .empty')).toContainText('Pas de partie aujourd');
  await expect(page.locator('[aria-label="Programmées"] .empty')).toContainText('Aucune partie programmée');
  await expect(page.locator('[aria-label="Historique"] .hint')).toContainText('Aucune partie terminée');
  await expect(page.locator('[aria-label="Aujourd\'hui"] .empty a')).toHaveAttribute('href', '/etagere');
});
