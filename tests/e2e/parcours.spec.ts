import { test, expect } from '@playwright/test';
import { devenirAmiDe } from './helpers/amis';
import { gameIdByTitle, lancerTirage, putOnShelf } from './helpers/shelf';

// Stamp base 36 : « parc-marc- » + 8 caractères ≤ limite d'inscription (20)
const stamp = Date.now().toString(36);

test('parcours complet : deux joueurs, sélection, tirage, historique', async ({ browser }) => {
  // Trajet complet (2 inscriptions, 2 jeux, soirée, tirage animé, historique) :
  // sur un runner CI chargé, ~35 s en incluant la reprise du double-appui
  // (3 clics × attente 8 s — cf. lancerTirage). Le défaut Playwright (30 s)
  // tuait le test après la navigation vers /tirage, avant le verdict (CI 2026-10-05).
  test.setTimeout(90_000);
  const ctxA = await browser.newContext(); const a = await ctxA.newPage();
  await a.goto('/register');
  await a.getByLabel('Pseudo').fill(`parc_marc_${stamp}`);
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
  await b.getByLabel('Pseudo').fill(`parc_lea_${stamp}`);
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
  await devenirAmiDe(a, `parc_lea_${stamp}`); await a.reload(); // v4.8.0 : seuls les amis sont proposés
  await a.getByLabel(new RegExp(`parc_lea_${stamp}`)).check();
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
  await lancerTirage(a); // double-appui avec reprise (flake v3.3.1 : clic avalé par le sync live)
  await expect(a.getByText('LA ROUE A PARLÉ')).toBeVisible({ timeout: 10_000 });

  // Historique : la soirée du jour vit dans « Ce soir » (badge d'état) — les picks
  // cumulés ne s'affichent plus (v3.3.0), le jeu de la partie attend la boîte sortie
  await a.goto('/nights');
  await expect(a.locator('[aria-label="Aujourd\'hui"] .badge-etat')).toContainText('En préparation');
  await expect(a.locator('[aria-label="Aujourd\'hui"] .chips')).toContainText(`parc_marc_${stamp}`);
});
