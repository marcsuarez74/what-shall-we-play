import { test, expect } from '@playwright/test';
import { gameIdByTitle, putOnShelf } from './helpers/shelf';

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
  await a.getByLabel('Titre du jeu').fill('Terraforming Mars');
  await a.getByRole('button', { name: 'Saisir à la main' }).click();
  await a.getByRole('button', { name: 'Ajouter à la ludothèque' }).click();

  // Léa s'inscrit et ajoute son jeu
  const ctxB = await browser.newContext(); const b = await ctxB.newPage();
  await b.goto('/register');
  await b.getByLabel('Pseudo').fill(`parc-lea-${stamp}`);
  await b.getByLabel('Code secret').fill('1234');
  const registerLea = b.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await b.getByRole('button', { name: 'Créer mon compte' }).click();
  await registerLea; // sinon le goto suivant peut interrompre le POST avant le cookie
  await b.goto('/games/add');
  await b.getByLabel('Titre du jeu').fill('Harmonies');
  await b.getByRole('button', { name: 'Saisir à la main' }).click();
  await b.getByRole('button', { name: 'Petit', exact: true }).click();
  await b.getByRole('button', { name: 'Ajouter à la ludothèque' }).click();

  // Marc crée la soirée avec Léa
  await a.goto('/etagere');
  await a.getByLabel(new RegExp(`parc-lea-${stamp}`)).check();
  await a.getByRole('button', { name: /Créer la partie/ }).click();

  // Étagère vide à la création (v3) : chacun pose son jeu depuis SA session —
  // le cœur du flux (Léa ne peut pas poser le jeu de Marc, ni l'inverse)
  await putOnShelf(a, await gameIdByTitle(a, 'Terraforming Mars'));
  await putOnShelf(b, await gameIdByTitle(b, 'Harmonies'));
  await a.goto('/etagere');
  await expect(a.locator('.box')).toHaveCount(2);
  await a.locator('.box').nth(0).click();
  // Review Focus n°1 : sans pochette (ni BGG ni upload), la fiche affiche le
  // placeholder ♟ — jamais une image cassée
  await expect(a.getByRole('dialog', { name: 'Terraforming Mars' }).locator('.cover-placeholder')).toHaveText('♟');
  await a.keyboard.press('Escape'); // fermer la fiche avant le CTA
  // v3.0.0 : Marc valide puis lance — Léa n'a pas validé : double-appui « Sûr ? »
  await a.getByRole('button', { name: 'Valider ma sélection' }).click();
  const lancer = a.getByRole('button', { name: /Lancer · 2|Sûr \? Lancer/ });
  await lancer.click(); // 1/2 prêts → demande de confirmation
  await lancer.click(); // « Sûr ? Lancer » → on lance quand même
  await expect(a.getByText('LA ROUE A PARLÉ')).toBeVisible({ timeout: 10_000 });

  // Historique
  await a.goto('/nights');
  await expect(a.getByText(/Terraforming Mars|Harmonies/)).toBeVisible();
});
