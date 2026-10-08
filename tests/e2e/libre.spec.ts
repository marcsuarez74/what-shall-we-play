import { test, expect, Page } from '@playwright/test';
import { devenirAmis } from './helpers/amis';
import { newGame, putOnShelf } from './helpers/shelf';
import { passerBienvenue } from './helpers/inscription';

// v4.19.0 — choix libre : pas de roue, chacun déclare « J'ai joué » (score facultatif)
// par manche ; le créateur termine ; l'historique montre le podium puis les manches.

async function register(page: Page, pseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const reg = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await reg;
  await passerBienvenue(page);
}

async function declarer(page: Page, bouton: RegExp | string, score: string) {
  await page.locator('.bottom-sheet').getByRole('button', { name: bouton }).click();
  await page.locator('.joue-form input').fill(score);
  const done = page.waitForResponse((r) => r.url().includes('/plays') && r.request().method() === 'POST');
  await page.locator('.joue-form').getByRole('button', { name: 'Valider' }).click();
  expect((await done).ok()).toBeTruthy();
}

test('choix libre : deux joueurs, deux manches, terminer, podium dans l’historique', async ({ browser }) => {
  test.setTimeout(90_000);
  const s = Date.now().toString(36);
  const a = await (await browser.newContext()).newPage();
  await register(a, `lb_a_${s}`);
  const b = await (await browser.newContext()).newPage();
  await register(b, `lb_b_${s}`);
  await devenirAmis(a, b);

  // création en Choix libre
  await a.reload();
  await a.locator('.player-list label', { hasText: `lb_b_${s}` }).locator('input').check();
  await a.getByRole('button', { name: /Choix libre/ }).click();
  await expect(a.getByRole('button', { name: /Choix libre/ })).toHaveAttribute('aria-pressed', 'true');
  const nightDone = a.waitForResponse((r) => r.url().endsWith('/api/nights') && r.request().method() === 'POST');
  await a.getByRole('button', { name: 'Créer la partie' }).click();
  const { nightId } = await (await nightDone).json() as { nightId: number };

  const gid = await newGame(a, 'Azul', 'moyen');
  await putOnShelf(a, gid, nightId);
  await a.goto('/etagere');
  await expect(a.locator('.badge-etat.b-libre')).toContainText('Choix libre');
  await expect(a.getByRole('button', { name: /Lancer/ })).toHaveCount(0); // pas de roue

  // manche 1 : A 42, B 30
  await a.locator('.box').first().click();
  await declarer(a, '🎲 J’ai joué', '42');
  await expect(a.locator('.classement li.moi')).toContainText('42');
  await expect(a.locator('.box .joue-badge')).toHaveText('✓');

  await b.goto('/etagere');
  await b.locator('.box').first().click();
  await declarer(b, '🎲 J’ai joué cette manche', '30');
  await expect(b.locator('.classement li').first()).toContainText(`lb_a_${s}`);

  // manche 2 : B gagne, A sans score
  await declarer(b, '🔁 Nouvelle manche', '50');
  await expect(b.locator('.box .joue-badge')).toHaveText('✓ ×2');
  await a.goto('/etagere');
  await a.locator('.box').first().click();
  await a.locator('.manche').nth(1).getByRole('button', { name: '🎲 J’ai joué cette manche' }).click();
  const done = a.waitForResponse((r) => r.url().includes('/plays') && r.request().method() === 'POST');
  await a.locator('.joue-form').getByRole('button', { name: 'Valider' }).click();
  expect((await done).ok()).toBeTruthy();
  await expect(a.locator('.manche').nth(1).locator('.sans-score')).toContainText('toi');

  // seul le créateur termine (double appui) → détail de la partie
  await expect(b.getByRole('button', { name: 'Terminer la partie' })).toHaveCount(0);
  await a.locator('.sheet-close').click();
  await a.getByRole('button', { name: 'Terminer la partie' }).click();
  await a.getByRole('button', { name: 'Terminer', exact: true }).click();
  await a.waitForURL(new RegExp(`/nights/${nightId}$`));
  await expect(a.locator('.badge-etat.b-libre')).toContainText('terminée');
  await expect(a.locator('.podium-nuit')).toContainText(`lb_a_${s} · 1`);
  await expect(a.locator('.podium-nuit')).toContainText(`lb_b_${s} · 1`); // une manche chacun : ex aequo
  await expect(a.locator('.hist-jeux li')).toHaveCount(2);
  await expect(a.locator('.hist-jeux li').nth(1)).toContainText(`👑 lb_b_${s}`);
});
