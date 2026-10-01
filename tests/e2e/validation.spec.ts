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

test('valider : la phrase « xxx a validé sa sélection » apparaît chez les autres en direct', async ({ browser }) => {
  const s = Date.now().toString(36);
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  await register(a, `val-m-${s}`);

  // Marc crée la partie avec Léa (inscrite avant lui → dans sa liste)
  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await register(b, `val-l-${s}`);
  await a.getByLabel(new RegExp(`val-l-${s}`)).check();
  const nightDone = a.waitForResponse((r) => r.url().endsWith('/api/nights') && r.request().method() === 'POST');
  await a.getByRole('button', { name: 'Créer la partie' }).click();
  const { nightId } = await (await nightDone).json() as { nightId: number };

  // Les deux pages sont sur l'étagère, flux SSE connectés
  await expect(a.locator('body')).toHaveAttribute('data-sync', 'on', { timeout: 15_000 });
  await expect(b.locator('body')).toHaveAttribute('data-sync', 'on', { timeout: 15_000 });

  // Léa valide DEPUIT SON TÉLÉPHONE (page b) : la phrase apparaît chez Marc sans recharger
  await b.getByRole('button', { name: 'Valider ma sélection' }).click();
  await expect(a.locator('.etats')).toContainText('a validé sa sélection', { timeout: 5_000 });
  await expect(a.locator('.etats')).toContainText(`val-l-${s}`);
  await expect(a.locator('.cta-zone .etat-line')).toContainText('1/2 prêts');
  // Chez Léa aussi, l'état a basculé
  await expect(b.locator('.pret-line')).toContainText('Ta sélection est validée');

  // Léa ajoute une boîte via l'API : sa validation saute, Marc le voit en direct
  const form = new FormData();
  form.set('title', 'Tardivement ajouté'); form.set('box_format', 'moyen');
  const g = await b.request.post('/api/games', { form });
  if (!g.ok()) throw new Error(`jeu léa: ${g.status()}`);
  const gid = ((await g.json()) as { id: number }).id;
  const put = await b.request.post(`/api/nights/${nightId}/games`, { data: { gameId: gid, added: true } });
  if (!put.ok()) throw new Error(`pose: ${put.status()}`);
  await expect(a.locator('.etats')).toContainText("n'a pas encore validé", { timeout: 5_000 });
  await expect(a.locator('.cta-zone .etat-line')).toContainText('0/2 prêts');
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
  await a.getByLabel(new RegExp(`lan-l-${s}`)).check();
  const nightDone = a.waitForResponse((r) => r.url().endsWith('/api/nights') && r.request().method() === 'POST');
  await a.getByRole('button', { name: 'Créer la partie' }).click();
  const { nightId: nightId2 } = await (await nightDone).json() as { nightId: number };

  // Marc pose une boîte (l'étagère ne doit pas être vide pour lancer)
  const form = new FormData();
  form.set('title', 'Le jeu du soir'); form.set('box_format', 'grand');
  const g = await a.request.post('/api/games', { form });
  if (!g.ok()) throw new Error(`jeu: ${g.status()}`);
  const gid = ((await g.json()) as { id: number }).id;
  const put = await a.request.post(`/api/nights/${nightId2}/games`, { data: { gameId: gid, added: true } });
  if (!put.ok()) throw new Error(`pose: ${put.status()}`);

  // Marc valide : 1/2 prêts — le bouton demande confirmation au premier appui
  await a.getByRole('button', { name: 'Valider ma sélection' }).click();
  const lancer = a.getByRole('button', { name: /Lancer le tirage · 1|Sûr \? Lancer/ });
  await lancer.click();
  await expect(a.getByRole('button', { name: 'Sûr ? Lancer' })).toBeVisible();

  // Léa valide (API) : la ligne passe à « Tout le monde est prêt ! » en direct…
  await b.getByRole('button', { name: 'Valider ma sélection' }).click();
  await expect(a.locator('.cta-zone .etat-line.pret')).toContainText('Tout le monde est prêt !', { timeout: 5_000 });
  // …et le bouton revient à son libellé simple ; un SEUL appui lance
  await expect(a.getByRole('button', { name: 'Lancer le tirage · 1' })).toBeVisible();
  await a.getByRole('button', { name: 'Lancer le tirage · 1' }).click();
  await expect(a).toHaveURL(/\/tirage\//);
  await ctxA.close();
  await ctxB.close();
});
