import { test, expect, Page } from '@playwright/test';
import { devenirAmis } from './helpers/amis';
import { newGame, putOnShelf } from './helpers/shelf';
import { passerBienvenue } from './helpers/inscription';

// v3.7 — le verdict 😍🙂😐 : trois pastilles sur la nuit terminée, révocables,
// compteurs du groupe (sans attribution) rafraîchis en direct via UserSync.
// Gabarit votes.spec.ts : register local, deux contextes, data-sync="on".

async function register(page: Page, pseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const reg = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await reg;
  await passerBienvenue(page);
}

async function creerPartieSolo(page: Page) {
  const nightDone = page.waitForResponse((r) => r.url().endsWith('/api/nights') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Créer la partie' }).click(); // créateur pré-coché
  const { nightId } = await (await nightDone).json() as { nightId: number };
  return nightId;
}

async function creerPartie(a: Page, pseudoInvite: string) {
  await a.reload(); // la liste des joueurs est rendue côté serveur
  await a.locator('.player-list label', { hasText: pseudoInvite }).locator('input').check();
  const nightDone = a.waitForResponse((r) => r.url().endsWith('/api/nights') && r.request().method() === 'POST');
  await a.getByRole('button', { name: 'Créer la partie' }).click();
  const { nightId } = await (await nightDone).json() as { nightId: number };
  return nightId;
}

async function monId(page: Page): Promise<number> {
  return ((await (await page.request.get('/api/me')).json()) as { id: number }).id;
}

/** Tirage + sortie de boîte + fin de soirée (hook : POST /api/nights/[id]/end via request). */
async function sortirEtTerminer(page: Page, nid: number, gid: number, scores: Record<string, number> = {}) {
  const draw = await page.request.post('/api/draw', { data: { nightId: nid, gameIds: [gid] } });
  expect(draw.ok()).toBeTruthy();
  const { gameId: sorti } = (await draw.json()) as { gameId: number };
  const out = await page.request.post(`/api/nights/${nid}/box-out`, { data: { gameId: sorti } });
  expect(out.ok()).toBeTruthy();
  const fin = await page.request.post(`/api/nights/${nid}/end`, { data: scores });
  expect(fin.ok()).toBeTruthy();
}

test('solo : bloc sur la nuit terminée, vote à 1, changement d avis reste cohérent', async ({ page }) => {
  const s = Date.now().toString(36);
  await register(page, `vd_${s}`);
  const nid = await creerPartieSolo(page);
  const gid = await newGame(page, 'Cascadia', 'grand');
  await putOnShelf(page, gid, nid);
  await sortirEtTerminer(page, nid, gid, { [(await monId(page))]: 24 });

  await page.goto(`/nights/${nid}`);
  const bloc = page.getByRole('group', { name: 'Ton verdict' });
  await expect(bloc).toBeVisible();
  await expect(bloc.locator('.verdict-q')).toContainText('Cascadia');
  await expect(bloc.locator('.verdict-note')).toContainText('ça pèse doucement');
  await expect(bloc.locator('.verdict-fait')).toHaveCount(0);

  const compteurs = bloc.locator('.verdict-compteurs');
  await expect(compteurs).toContainText('La table');
  const adore = compteurs.locator('.compteur', { hasText: '😍' });
  const bien = compteurs.locator('.compteur', { hasText: '🙂' });
  await expect(adore.locator('b')).toHaveText('0');
  await expect(bien.locator('b')).toHaveText('0');

  // vote : compteur à 1, pastille pressée, confirmation visible
  await bloc.getByRole('button', { name: 'Verdict : adoré' }).click();
  await expect(adore.locator('b')).toHaveText('1');
  await expect(bloc.getByRole('button', { name: 'Verdict : adoré' })).toHaveAttribute('aria-pressed', 'true');
  await expect(bloc.locator('.verdict-fait')).toBeVisible();
  await expect(bloc.locator('.verdict-fait')).toContainText("reclique pour changer d'avis");

  // changement d'avis : un verdict par joueur — le compteur reste à 1, pas deux
  await bloc.getByRole('button', { name: 'Verdict : bien' }).click();
  await expect(bien.locator('b')).toHaveText('1');
  await expect(adore.locator('b')).toHaveText('0');
  await expect(bloc.getByRole('button', { name: 'Verdict : bien' })).toHaveAttribute('aria-pressed', 'true');
  await expect(bloc.getByRole('button', { name: 'Verdict : adoré' })).toHaveAttribute('aria-pressed', 'false');

  // re-clic de la même pastille : jamais de double comptage
  await bloc.getByRole('button', { name: 'Verdict : bien' }).click();
  await expect(bien.locator('b')).toHaveText('1');

  // recharge : le verdict survit (source de vérité serveur)
  await page.reload();
  await expect(bloc.getByRole('button', { name: 'Verdict : bien' })).toHaveAttribute('aria-pressed', 'true');
  await expect(bien.locator('b')).toHaveText('1');
  await expect(adore.locator('b')).toHaveText('0');
});

test('duo : le verdict de A fait bouger le compteur chez B sans recharger', async ({ browser }) => {
  const s = Date.now().toString(36);
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  await register(a, `va_a_${s}`);
  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await register(b, `va_b_${s}`);
  await devenirAmis(a, b);
  const nid = await creerPartie(a, `va_b_${s}`);
  const gid = await newGame(a, 'Wingspan', 'grand');
  await putOnShelf(a, gid, nid);
  await sortirEtTerminer(a, nid, gid, { [(await monId(a))]: 24, [(await monId(b))]: 19 });

  await a.goto(`/nights/${nid}`);
  await b.goto(`/nights/${nid}`);
  await expect(a.locator('body')).toHaveAttribute('data-sync', 'on', { timeout: 15_000 });
  await expect(b.locator('body')).toHaveAttribute('data-sync', 'on', { timeout: 15_000 });

  // A vote depuis son téléphone : chez B, le compteur passe à 1 tout seul
  await a.getByRole('group', { name: 'Ton verdict' }).getByRole('button', { name: 'Verdict : adoré' }).click();
  const compteursB = b.locator('.verdict-compteurs');
  await expect(compteursB.locator('.compteur', { hasText: '😍' }).locator('b')).toHaveText('1', { timeout: 5_000 });
  // B n'a pas voté : aucune pastille pressée chez lui (compteurs anonymes)
  await expect(b.locator('.pastille-verdict[aria-pressed="true"]')).toHaveCount(0);
});

test('non-membre : impossible de poser un verdict sur la soirée des autres', async ({ browser }) => {
  const s = Date.now().toString(36);
  const hote = await browser.newContext().then((c) => c.newPage());
  await register(hote, `vh_${s}`);
  const nid = await creerPartieSolo(hote);
  const gid = await newGame(hote, 'Azul', 'petit');
  await putOnShelf(hote, gid, nid);
  await sortirEtTerminer(hote, nid, gid, { [(await monId(hote))]: 12 });

  const ctxX = await browser.newContext();
  const intrus = await ctxX.newPage();
  await register(intrus, `vx_${s}`);
  // La route garde l'accès (pattern votes : userCanAccessNight → 404 « introuvable »,
  // la soirée des autres n'existe pas pour lui ; le 403 de poserVerdict est couvert
  // en unitaire T1). Le contrat testé : rejet, jamais d'écriture.
  const res = await intrus.request.post(`/api/nights/${nid}/verdict`, { data: { verdict: 'adore' } });
  expect(res.status()).toBe(404);
  expect(((await res.json()) as { error: string }).error).toContain('introuvable');
});

test('poids : après verdicts posés, le tirage répond toujours un jeu de l étagère', async ({ page }) => {
  const s = Date.now().toString(36);
  await register(page, `vw_${s}`);
  const nid1 = await creerPartieSolo(page);
  const gid1 = await newGame(page, 'Cascadia', 'grand');
  await putOnShelf(page, gid1, nid1);
  await sortirEtTerminer(page, nid1, gid1, { [(await monId(page))]: 20 });

  // verdicts posés via request.post — le remplacement aussi (adore → neutre)
  await page.request.post(`/api/nights/${nid1}/verdict`, { data: { verdict: 'adore' } });
  await page.request.post(`/api/nights/${nid1}/verdict`, { data: { verdict: 'neutre' } });

  // nouvelle soirée : le jeu verdicté repasse au tirage, chemin pondéré exercé
  // (la distribution exacte est couverte en T2, rnd injecté) — sans dépendre du hasard
  await page.goto('/etagere');
  const nid2 = await creerPartieSolo(page);
  const gid2 = await newGame(page, 'Azul', 'moyen');
  await putOnShelf(page, gid2, nid2);
  await putOnShelf(page, gid1, nid2);
  const draw = await page.request.post('/api/draw', { data: { nightId: nid2, gameIds: [gid1, gid2] } });
  expect(draw.ok()).toBeTruthy();
  const { gameId } = (await draw.json()) as { gameId: number };
  expect([gid1, gid2]).toContain(gameId);
});
