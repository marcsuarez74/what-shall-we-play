import { test, expect } from '@playwright/test';

// v3.0.0 — « chacun dit quand il est prêt » : valider sa sélection est un
// signal partagé (pas un verrou). L'état apparaît chez tous en direct, un
// ajout après validation le saute, et le créateur lance : un appui si tout
// le monde est prêt, double-appui « Sûr ? » sinon.

async function register(page: import('@playwright/test').Page, pseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const reg = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await reg;
  await page.waitForURL('/etagere');
}

/** Pose une boîte sur l'étagère de la soirée via l'API (ludothèque du joueur). */
async function poserBoite(page: import('@playwright/test').Page, nightId: number, titre: string) {
  const form = new FormData();
  form.set('title', titre);
  form.set('box_format', 'grand');
  const g = await page.request.post('/api/games', { form });
  if (!g.ok()) throw new Error(`jeu ${titre}: ${g.status()}`);
  const gid = ((await g.json()) as { id: number }).id;
  const put = await page.request.post(`/api/nights/${nightId}/games`, { data: { gameId: gid, added: true } });
  if (!put.ok()) throw new Error(`pose ${titre}: ${put.status()}`);
}

async function creerPartie(a: import('@playwright/test').Page, pseudoInvite: string) {
  // la liste des joueurs est rendue côté serveur : recharger pour voir l'invité
  // inscrit entre-temps (marc s'est inscrit avant léa)
  await a.reload();
  await a.locator('.player-list label', { hasText: pseudoInvite }).locator('input').check();
  const nightDone = a.waitForResponse((r) => r.url().endsWith('/api/nights') && r.request().method() === 'POST');
  await a.getByRole('button', { name: 'Créer la partie' }).click();
  const { nightId } = await (await nightDone).json() as { nightId: number };
  return nightId;
}

test('valider : la phrase « xxx a validé sa sélection » apparaît chez les autres en direct', async ({ browser }) => {
  const s = Date.now().toString(36);
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  await register(a, `val-m-${s}`);

  // Marc invite Léa (inscrite avant lui → dans sa liste)
  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await register(b, `val-l-${s}`);
  const nightId = await creerPartie(a, `val-l-${s}`);

  // Marc pose une boîte : la ligne d'état « X/Y prêts » existe chez le créateur
  await poserBoite(a, nightId, 'Le jeu de marc');

  // Les deux pages sont sur l'étagère, flux SSE connectés
  await expect(a.locator('body')).toHaveAttribute('data-sync', 'on', { timeout: 15_000 });
  await expect(b.locator('body')).toHaveAttribute('data-sync', 'on', { timeout: 15_000 });

  // Léa valide DEPUIS SON TÉLÉPHONE (page b) : la phrase apparaît chez Marc sans recharger
  await b.getByRole('button', { name: 'Valider ma sélection' }).click();
  await expect(a.locator('.etats')).toContainText('a validé sa sélection', { timeout: 5_000 });
  await expect(a.locator('.etats')).toContainText(`val-l-${s}`);
  // Chez Léa aussi, l'état a basculé
  await expect(b.locator('.pill-ok')).toContainText('✓ Validée');

  // Léa ajoute une boîte via l'API : sa validation saute, Marc le voit en direct
  await poserBoite(b, nightId, 'Tardivement ajouté');
  await expect(a.locator('.etats')).toContainText("n'a pas encore validé", { timeout: 5_000 });
  // Chez Léa : re-validation exigée
  await expect(b.getByRole('button', { name: 'Valider ma sélection' })).toBeVisible();
  await ctxA.close();
  await ctxB.close();
});

test('lancer : un appui quand tout le monde a validé, double-appui sinon', async ({ browser }) => {
  const s = Date.now().toString(36);
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  await register(a, `lan-m-${s}`);

  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await register(b, `lan-l-${s}`);
  const nightId = await creerPartie(a, `lan-l-${s}`);
  await poserBoite(a, nightId, 'Le jeu du soir');

  // Marc valide : 1/2 prêts — la ligne d'état apparaît, le bouton demande confirmation au premier appui
  await a.getByRole('button', { name: 'Valider ma sélection' }).click();
  await expect(a.locator('.pill-ok')).toContainText('✓ Validée');
  await expect(a.locator('.cta-statut')).toContainText('1/2 prêts');
  const lancer = a.getByRole('button', { name: /Lancer · 1|Sûr \? Lancer/ });
  await lancer.click();
  await expect(a.getByRole('button', { name: 'Sûr ? Lancer' })).toBeVisible();

  // Léa valide : le lanceur passe au vert (« tout le monde est prêt ») en direct…
  await b.getByRole('button', { name: 'Valider ma sélection' }).click();
  await expect(a.locator('.cta-row .btn-copper.pret')).toBeVisible({ timeout: 5_000 });
  // …et le « Sûr ? » s'efface : un SEUL appui lance
  await expect(a.getByRole('button', { name: 'Lancer · 1' })).toBeVisible();
  await a.getByRole('button', { name: 'Lancer · 1' }).click();
  await expect(a).toHaveURL(/\/tirage\//);
  await ctxA.close();
  await ctxB.close();
});
