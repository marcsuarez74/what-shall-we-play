import { test, expect, type Page } from '@playwright/test';
import { newGame, putOnShelf } from './helpers/shelf';

const hier = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE');
const demain = new Date(Date.now() + 86400000).toLocaleDateString('sv-SE');

async function register(page: Page, pseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const done = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await done;
  await page.waitForURL('/etagere');
}

async function monId(page: Page): Promise<number> {
  return ((await (await page.request.get('/api/me')).json()) as { id: number }).id;
}

/** Compte + jeu (helpers API), nuit via API, étagère, tirage, boîte, fin AVEC scores. */
async function partieTerminee(page: Page, pseudo: string, score?: number): Promise<{ nightId: number; gameId: number }> {
  await register(page, pseudo);
  const gameId = await newGame(page, `Cascadia-${pseudo}`, 'grand');
  const { nightId } = await (await page.request.post('/api/nights', { data: { playerIds: [] } })).json() as { nightId: number };
  await putOnShelf(page, gameId, nightId);
  await page.request.post('/api/draw', { data: { nightId, gameIds: [gameId] } });
  await page.request.post(`/api/nights/${nightId}/box-out`, { data: { gameId } });
  // La route /end attend le wrapper { scores } — un record nu serait ignoré.
  // monId APRÈS le register : évalué avant l'appel (arguments JS), /api/me répond
  // 401 et la clé de score vaut "undefined" → Number(...) = NaN → 400 « Score
  // invalide », la nuit ne se termine jamais.
  const scores = score === undefined ? {} : { [await monId(page)]: score };
  await page.request.post(`/api/nights/${nightId}/end`, { data: { scores } });
  return { nightId, gameId };
}

test('corriger un score → le podium et la page se mettent à jour', async ({ page }) => {
  const s = Date.now().toString(36);
  const { nightId } = await partieTerminee(page, `cor_${s}`, 78);
  await page.goto(`/nights/${nightId}`);
  await page.getByRole('button', { name: 'Corriger cette partie' }).click();
  await page.getByLabel(`Score de ${`cor_${s}`}`).fill('82');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.pod1 .sc')).toContainText('82');
});

test('retrait d\'un participant scoré → enregistré, podium à un seul score, un seul chip', async ({ page, browser }) => {
  const s = Date.now().toString(36);
  await register(page, `rt_${s}`);
  const createurId = await monId(page);
  // second compte dans un second contexte (idiome du test non-membre)
  const second = await (await browser.newContext()).newPage();
  await register(second, `rt2_${s}`);
  const secondId = await monId(second); // /api/me de SON contexte
  const gameId = await newGame(page, `Cascadia-rt-${s}`, 'grand');
  const { nightId } = await (await page.request.post('/api/nights', { data: { playerIds: [] } })).json() as { nightId: number };
  await page.request.patch(`/api/nights/${nightId}`, { data: { playerIds: [createurId, secondId] } }); // branche v1 : nuit en préparation
  await putOnShelf(page, gameId, nightId);
  await page.request.post('/api/draw', { data: { nightId, gameIds: [gameId] } });
  await page.request.post(`/api/nights/${nightId}/box-out`, { data: { gameId } });
  // wrapper { scores } obligatoire (cf. partieTerminee) — deux participants scorés
  await page.request.post(`/api/nights/${nightId}/end`, { data: { scores: { [createurId]: 24, [secondId]: 71 } } });
  await page.goto(`/nights/${nightId}`);
  await page.getByRole('button', { name: 'Corriger cette partie' }).click();
  await page.getByRole('button', { name: `rt2_${s} ✕` }).click(); // décocher le second participant scoré
  // attendre le PATCH (idiome « pastille ») : l'ancien code répondait 400 « Score invalide »
  const patch = page.waitForResponse((r) => r.url().endsWith(`/api/nights/${nightId}`) && r.request().method() === 'PATCH');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  expect((await patch).status()).toBe(200);
  await expect(page.locator('p[role="alert"]')).toHaveCount(0); // aucune erreur affichée
  await expect(page.locator('.pod1 .sc')).toContainText('24'); // podium : le score du créateur seul
  await page.getByRole('button', { name: 'Corriger cette partie' }).click();
  await expect(page.locator('.corriger-chip:not(.hors)')).toHaveCount(1); // un seul participant au retour
  await expect(page.locator('.corriger-chip:not(.hors)')).toContainText(`rt_${s}`);
});

test('changer le jeu → alerte, puis verdicts réinitialisés (zéro)', async ({ page }) => {
  const s = Date.now().toString(36);
  const { nightId } = await partieTerminee(page, `ver_${s}`, 20);
  await newGame(page, `Everdell-${s}`, 'moyen'); // le second jeu à sélectionner
  await page.request.post(`/api/nights/${nightId}/verdict`, { data: { verdict: 'adore' } });
  await page.goto(`/nights/${nightId}`);
  await page.getByRole('button', { name: 'Corriger cette partie' }).click();
  await page.getByLabel('Jeu joué').selectOption({ label: `Everdell-${s}` });
  // p[role="alert"] : le route announcer de Next (div#__next-route-announcer__,
  // role="alert" aussi) fausse le getByRole('alert') nu — strict mode violation.
  await expect(page.locator('p[role="alert"]')).toContainText('réinitialise les verdicts');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  // la modale de suppression sert de surface d'assertion : compteurs à zéro
  await page.getByRole('button', { name: '🗑️ Supprimer cette partie' }).click();
  await expect(page.getByRole('dialog')).toContainText('0 😍 · 0 🙂 · 0 😐');
  await page.getByRole('button', { name: 'Garder' }).click();
});

test('supprimer avec confirmation → redirection, nuit 404', async ({ page }) => {
  const s = Date.now().toString(36);
  const { nightId } = await partieTerminee(page, `sup_${s}`, 55);
  await page.goto(`/nights/${nightId}`);
  await page.getByRole('button', { name: '🗑️ Supprimer cette partie' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click();
  await page.waitForURL('**/nights');
  const res = await page.goto(`/nights/${nightId}`);
  expect(res!.status()).toBe(404);
});

test('non-membre : page 404 et API 404 (PATCH comme DELETE)', async ({ browser }) => {
  const s = Date.now().toString(36);
  const page = await (await browser.newContext()).newPage();
  const { nightId } = await partieTerminee(page, `nm_${s}`);
  const autre = await (await browser.newContext()).newPage();
  await register(autre, `nm_autre_${s}`);
  expect((await autre.goto(`/nights/${nightId}`))!.status()).toBe(404);
  const patch = await autre.request.patch(`/api/nights/${nightId}`, { data: { playedAt: hier } });
  expect(patch.status()).toBe(404);
  const del = await autre.request.delete(`/api/nights/${nightId}`);
  expect(del.status()).toBe(404);
});

test('date future → message d\'erreur affiché, rien n\'enregistré', async ({ page }) => {
  const s = Date.now().toString(36);
  const { nightId } = await partieTerminee(page, `df_${s}`);
  await page.goto(`/nights/${nightId}`);
  await page.getByRole('button', { name: 'Corriger cette partie' }).click();
  await page.getByLabel('Date de la partie').fill(demain);
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('p[role="alert"]')).toContainText('Date invalide'); // clé existante réutilisée
});

test('créer une partie passée en un geste → page terminée, Mes parties, stats', async ({ page }) => {
  const s = Date.now().toString(36);
  await register(page, `retro_${s}`);
  const gameId = await newGame(page, `Everdell-${s}`, 'moyen');
  await page.goto('/profil');
  await page.getByRole('button', { name: '＋ Créer une partie passée' }).click();
  await page.getByLabel('Date de la partie').fill(hier);
  await page.getByLabel('Jeu joué').selectOption(String(gameId));
  await page.getByLabel(`Score de retro_${s}`).fill('63');
  await page.getByRole('button', { name: 'Créer la partie' }).click();
  await page.waitForURL('**/nights/**');
  await expect(page.locator('.badge-etat.b-term')).toBeVisible(); // badge « Terminée »
  await expect(page.locator('.pod1')).toContainText('63');
  await page.goto('/profil');
  await expect(page.locator('.mes-parties .mp-row').first()).toContainText(`Everdell-${s}`);
  await expect(page.locator('.mp-pastille')).toHaveCount(0); // les scores sont là
});

// partieTerminee(page, pseudo) SANS 3e arg : la nuit se termine sans scores
// (score === undefined → scores = {}). Le `{}` du brief ne passe ni tsc
// (score?: number) ni endNight (Number.isFinite({}) = false → 400, nuit jamais
// terminée) — même idiome que les tests df- et nm- ci-dessus.
test('partie terminée sans scores → pastille « Scores à saisir » dans Mes parties', async ({ page }) => {
  const s = Date.now().toString(36);
  const { nightId } = await partieTerminee(page, `ps_${s}`); // terminée SANS scores
  await page.goto('/profil');
  const ligne = page.locator('.mes-parties .mp-row', { hasText: `Cascadia-ps_${s}` });
  await expect(ligne).toContainText('Scores à saisir');
  // correction depuis la page : la pastille disparaît
  await page.goto(`/nights/${nightId}`);
  await page.getByRole('button', { name: 'Corriger cette partie' }).click();
  await page.getByLabel(`Score de ps_${s}`).fill('30');
  // attendre le PATCH : click() ne couvre pas le fetch async — une navigation
  // immédiate l'aborterait (trace : status -1), la correction ne part jamais.
  const corrige = page.waitForResponse((r) => r.url().endsWith(`/api/nights/${nightId}`) && r.request().method() === 'PATCH');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await corrige;
  await page.goto('/profil');
  await expect(page.locator('.mp-pastille')).toHaveCount(0);
});

test('date de demain au formulaire rétro → erreur affichée', async ({ page }) => {
  const s = Date.now().toString(36);
  await register(page, `rd_${s}`);
  const gameId = await newGame(page, `Azul-rd-${s}`, 'petit');
  await page.goto('/profil');
  await page.getByRole('button', { name: '＋ Créer une partie passée' }).click();
  await page.getByLabel('Date de la partie').fill(demain);
  await page.getByLabel('Jeu joué').selectOption(String(gameId));
  await page.getByRole('button', { name: 'Créer la partie' }).click();
  // p[role="alert"] : ruling Task 4 — le route announcer de Next fausse getByRole('alert')
  await expect(page.locator('p[role="alert"]')).toContainText('Date invalide');
});
