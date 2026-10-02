import { test, expect, Page } from '@playwright/test';
import { newGame, putOnShelf } from './helpers/shelf';

// v3.5 — le vote s'incruste sur l'étagère : badge 👍 haut-droite de chaque boîte,
// cuivré quand c'est mon vote, révocable, partagé en direct. Le rituel ne change pas.

async function register(page: Page, pseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const reg = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await reg;
  await page.waitForURL('/etagere');
}

async function creerPartie(a: Page, pseudoInvite: string) {
  await a.reload(); // la liste des joueurs est rendue côté serveur
  await a.locator('.player-list label', { hasText: pseudoInvite }).locator('input').check();
  const nightDone = a.waitForResponse((r) => r.url().endsWith('/api/nights') && r.request().method() === 'POST');
  await a.getByRole('button', { name: 'Créer la partie' }).click();
  const { nightId } = await (await nightDone).json() as { nightId: number };
  return nightId;
}

async function creerPartieSolo(page: Page) {
  const nightDone = page.waitForResponse((r) => r.url().endsWith('/api/nights') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Créer la partie' }).click(); // créateur pré-coché
  const { nightId } = await (await nightDone).json() as { nightId: number };
  return nightId;
}

test('badge : visible à 0, tap = vote cuivré, re-tap retire, sans ouvrir la fiche', async ({ page }) => {
  await register(page, `vt-${Date.now().toString(36)}`);
  const nightId = await creerPartieSolo(page);
  const gid = await newGame(page, 'Cascadia', 'grand');
  await putOnShelf(page, gid, nightId);
  await page.goto('/etagere');

  const badge = page.locator('.box .vote-badge');
  await expect(badge).toContainText('0'); // visible même à zéro : l'invitation à voter
  await badge.click();
  await expect(badge).toContainText('1');
  await expect(badge).toHaveClass(/vote-moi/); // cuivré : MON vote
  await expect(page.locator('.sheet-backdrop')).toHaveCount(0); // pas de fiche ouverte
  // la boîte hors badge ouvre toujours la fiche
  await page.locator('.box').first().click();
  await expect(page.locator('.sheet-backdrop')).toBeVisible();
  await page.locator('.sheet-close').click();
  await expect(page.locator('.sheet-backdrop')).toHaveCount(0);

  await badge.click(); // re-tap : retiré
  await expect(badge).toContainText('0');
  await expect(badge).not.toHaveClass(/vote-moi/);
});

test('sync live : le vote de A monte le badge chez B sans rechargement', async ({ browser }) => {
  const s = Date.now().toString(36);
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  await register(a, `vt-a-${s}`);
  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await register(b, `vt-b-${s}`);
  const nightId = await creerPartie(a, `vt-b-${s}`);

  const gid = await newGame(a, 'Wingspan', 'grand');
  await putOnShelf(a, gid, nightId);
  await a.goto('/etagere');
  await expect(a.locator('body')).toHaveAttribute('data-sync', 'on', { timeout: 15_000 });
  await expect(b.locator('body')).toHaveAttribute('data-sync', 'on', { timeout: 15_000 });

  // A vote depuis son téléphone : le badge de B passe à 1 tout seul
  await a.locator('.box .vote-badge').click();
  await expect(b.locator('.box .vote-badge')).toContainText('1', { timeout: 5_000 });
  await expect(b.locator('.box .vote-badge')).not.toHaveClass(/vote-moi/); // pas LE vote de B
});
