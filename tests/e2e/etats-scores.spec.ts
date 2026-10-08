import { test, expect, Page } from '@playwright/test';
import { devenirAmiDe } from './helpers/amis';
import { newGame, gameIdByTitle, nightIdOf, putOnShelf } from './helpers/shelf';
import { passerBienvenue } from './helpers/inscription';

// v3.3 — la soirée a un ÉTAT visible : badge « En préparation » puis « En jeu »
// (bandeau vert, étagère gelée) ; la soirée terminée laisse place à la carte
// « Terminée ». Helper réutilisé par les tests scores/médailles (T7-T9).

/** Enregistre un compte (1 joueur) et crée la partie du soir. */
async function registerAndStart(page: Page, pseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const reg = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await reg;
  await passerBienvenue(page);
  await page.getByRole('button', { name: 'Créer la partie' }).click();
}

test('étagère : badge En préparation, puis bandeau en jeu après la boîte', async ({ page }) => {
  await registerAndStart(page, `eta_${Date.now()}`);
  const g = await newGame(page, 'Cascadia', 'moyen');
  await putOnShelf(page, g);
  await page.goto('/etagere');
  await expect(page.locator('.badge-etat')).toContainText('En préparation');
  // valider puis lancer + sortir la boîte (flux tirage via API pour aller vite)
  await page.getByRole('button', { name: 'Valider ma sélection' }).click();
  await expect(page.locator('.pill-ok')).toContainText('✓ Validée');
  const nid = await nightIdOf(page);
  const draw = await page.request.post('/api/draw', { data: { nightId: nid, gameIds: [g] } });
  const { gameId } = await draw.json();
  const out = await page.request.post(`/api/nights/${nid}/box-out`, { data: { gameId } });
  expect(out.ok()).toBeTruthy();
  await page.goto('/etagere');
  await expect(page.locator('.badge-etat')).toContainText('En jeu');
  await expect(page.locator('.bandeau')).toContainText('Cascadia');
  // l'étagère est gelée : plus d'ajout, plus de validation
  await expect(page.getByRole('button', { name: /Ajouter des jeux/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Valider ma sélection' })).toHaveCount(0);
  // créateur : CTA vers le carnet des scores
  await expect(page.getByRole('link', { name: '🏁 Partie terminée' })).toBeVisible();
});

// Variante 2 joueurs — pattern établi (validation.spec.ts) : l'invité s'inscrit
// D'ABORD, le créateur recharge la liste, le coche, puis crée la partie.
async function registerAndStart2Joueurs(page: Page, pseudo: string, invitePseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const reg = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await reg;
  await passerBienvenue(page);
  await page.reload(); // la liste des joueurs est rendue côté serveur
  await devenirAmiDe(page, invitePseudo); await page.reload();
  await page.locator('.player-list label', { hasText: invitePseudo }).locator('input').check();
  const nightDone = page.waitForResponse((r) => r.url().endsWith('/api/nights') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Créer la partie' }).click();
  await nightDone;
}

test('carnet des scores : créateur seulement, médailles en direct, égalité, fin de partie', async ({ page, browser }) => {
  // Pattern établi (validation.spec.ts) : l'invité s'inscrit D'ABORD, le créateur
  // le coche dans la liste des joueurs puis crée la partie. Pseudos ≤ 20 car.
  const s = Date.now().toString(36);
  const invite = await browser.newContext();
  const p2 = await invite.newPage();
  await p2.goto('/register');
  await p2.getByLabel('Pseudo').fill(`inv_${s}`);
  await p2.getByLabel('Code secret').fill('1234');
  await p2.getByRole('button', { name: 'Créer mon compte' }).click();
  await passerBienvenue(p2);

  await registerAndStart2Joueurs(page, `car_${s}`, `inv_${s}`); // reload + check invité + Créer la partie
  const g = await newGame(page, 'Azul', 'petit');
  await putOnShelf(page, g);
  const nid = await nightIdOf(page);

  // l'invité ne peut PAS ouvrir le carnet (créateur seulement)
  await p2.goto(`/nights/${nid}/scores`);
  await expect(p2).toHaveURL(/\/(nights|etagere)$/);

  // le créateur sort la boîte et ouvre le carnet
  const draw = await page.request.post('/api/draw', { data: { nightId: nid, gameIds: [g] } });
  const { gameId } = await draw.json();
  await page.request.post(`/api/nights/${nid}/box-out`, { data: { gameId } });
  await page.goto(`/nights/${nid}/scores`);
  await expect(page.locator('.carnet')).toBeVisible();
  const inputs = page.locator('.score-in');
  await inputs.nth(0).fill('24');
  await inputs.nth(1).fill('19');
  await expect(page.locator('.carnet .med').nth(0)).toHaveText('👑');
  await expect(page.locator('.carnet .med').nth(1)).toHaveText('🥈');
  // égalité : même médaille (rankScores dense)
  await inputs.nth(1).fill('24');
  await expect(page.locator('.carnet .med').nth(1)).toHaveText('👑');
  await page.getByRole('button', { name: '✓ Enregistrer et terminer' }).click();
  await page.waitForURL(`**/nights/${nid}`);
  // Task 8 livre le détail réel : la redirection du carnet affiche le podium
  // (24/24 → égalité, les deux premiers partagent la carte 👑)
  await expect(page.locator('.pod1')).toContainText('👑');
  await expect(page.locator('.pod1')).toContainText('24');
  await expect(page.locator('.badge-etat')).toContainText('Terminée');
});

test('historique : une carte par partie, détail avec podium et partage', async ({ page, browser }) => {
  // RULING : le helper établi crée des soirées à 2 joueurs (le brief visait 3,
  // scores 24/19/10) — on valide .pod1 + .pod23 (👑/🥈) et l'ABSENCE de .pod-autres.
  const s = Date.now().toString(36);
  const invite = await browser.newContext();
  const p2 = await invite.newPage();
  await p2.goto('/register');
  await p2.getByLabel('Pseudo').fill(`his_${s}`);
  await p2.getByLabel('Code secret').fill('1234');
  await p2.getByRole('button', { name: 'Créer mon compte' }).click();
  await passerBienvenue(p2);

  await registerAndStart2Joueurs(page, `pod_${s}`, `his_${s}`);
  const g = await newGame(page, 'Cascadia', 'moyen');
  await putOnShelf(page, g);
  const nid = await nightIdOf(page);
  const draw = await page.request.post('/api/draw', { data: { nightId: nid, gameIds: [g] } });
  const { gameId } = await draw.json();
  await page.request.post(`/api/nights/${nid}/box-out`, { data: { gameId } });

  // « Ce soir » : badge d'état + jeu de la partie — les picks cumulés ont disparu
  await page.goto('/nights');
  await expect(page.locator('[aria-label="Aujourd\'hui"] .badge-etat')).toContainText('En jeu');
  await expect(page.locator('.jeu-partie')).toContainText('Cascadia');
  await expect(page.locator('.night-picks')).toHaveCount(0);

  // scores 24/19 puis fin de partie → redirection vers le détail
  await page.goto(`/nights/${nid}/scores`);
  const inputs = page.locator('.score-in');
  await inputs.nth(0).fill('24');
  await inputs.nth(1).fill('19');
  await page.getByRole('button', { name: '✓ Enregistrer et terminer' }).click();
  await page.waitForURL(`**/nights/${nid}`);

  // détail : carte 👑 bordée cuivre, duo 🥈, pas de .pod-autres (2 joueurs), partage
  await expect(page.locator('.pod1')).toContainText('👑');
  await expect(page.locator('.pod1')).toContainText('24');
  await expect(page.locator('.pod23')).toContainText('🥈');
  await expect(page.locator('.pod23')).toContainText('19');
  await expect(page.locator('.pod-autres')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '💬 Partager les résultats' })).toBeVisible();

  // l'historique porte UNE carte : gagnant 👑 · score, date, clic → détail
  await page.goto('/nights');
  const carte = page.locator('.hist-card').first();
  await expect(carte).toContainText('Cascadia');
  await expect(carte.locator('.gagnant')).toContainText('👑');
  await expect(carte.locator('.gagnant')).toContainText('24 pts');
  await carte.click();
  await page.waitForURL('**/nights/*');
  await expect(page.locator('.pod1')).toContainText('👑');
  await expect(page.locator('.pod23')).toContainText('🥈');
});

test('soirée terminée sans scores : détail sobre, aucune erreur', async ({ page }) => {
  await registerAndStart(page, `sans_${Date.now().toString(36)}`);
  const g = await newGame(page, 'Harmonies', 'moyen');
  await putOnShelf(page, g);
  const nid = await nightIdOf(page);
  const draw = await page.request.post('/api/draw', { data: { nightId: nid, gameIds: [g] } });
  const { gameId } = await draw.json();
  await page.request.post(`/api/nights/${nid}/box-out`, { data: { gameId } });

  // « Terminer sans scores » depuis le carnet → la carte d'historique dit « pas de scores »
  await page.goto(`/nights/${nid}/scores`);
  await page.getByRole('button', { name: 'Terminer sans scores' }).click();
  await page.waitForURL(`**/nights/${nid}`);
  await page.goto('/nights');
  const carte = page.locator('.hist-card').first();
  await expect(carte).toContainText('Harmonies');
  await expect(carte.locator('.gagnant')).toContainText('pas de scores');
  await carte.click();
  await page.waitForURL('**/nights/*');
  // détail sobre : ni podium ni partage, le message des annales
  await expect(page.locator('.sans-score')).toBeVisible();
  await expect(page.locator('.sans-score')).toContainText('Pas de scores');
  await expect(page.locator('.pod1')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '💬 Partager les résultats' })).toHaveCount(0);
});
