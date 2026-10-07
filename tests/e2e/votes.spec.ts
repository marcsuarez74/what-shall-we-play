import { test, expect, Page } from '@playwright/test';
import { devenirAmis } from './helpers/amis';
import { lancerTirage, newGame, putOnShelf } from './helpers/shelf';

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
  await register(page, `vt_${Date.now().toString(36)}`);
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
  await expect(page.locator('.bottom-sheet .votants')).toContainText('👍 1 vote'); // v4.17.0
  await expect(page.locator('.bottom-sheet .votants')).toContainText('Toi');
  await page.locator('.sheet-close').click();
  await expect(page.locator('.sheet-backdrop')).toHaveCount(0);

  await badge.click(); // re-tap : retiré
  await expect(badge).toContainText('0');
  await expect(badge).not.toHaveClass(/vote-moi/);
  await page.locator('.box').first().click();
  await expect(page.locator('.bottom-sheet .votants')).toContainText('Aucun vote');
});

test('sync live : le vote de A monte le badge chez B sans rechargement', async ({ browser }) => {
  const s = Date.now().toString(36);
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  await register(a, `vt_a_${s}`);
  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await register(b, `vt_b_${s}`);
  await devenirAmis(a, b);
  const nightId = await creerPartie(a, `vt_b_${s}`);

  const gid = await newGame(a, 'Wingspan', 'grand');
  await putOnShelf(a, gid, nightId);
  await a.goto('/etagere');
  await expect(a.locator('body')).toHaveAttribute('data-sync', 'on', { timeout: 15_000 });
  await expect(b.locator('body')).toHaveAttribute('data-sync', 'on', { timeout: 15_000 });

  // A vote depuis son téléphone : le badge de B passe à 1 tout seul
  await a.locator('.box .vote-badge').click();
  await expect(b.locator('.box .vote-badge')).toContainText('1', { timeout: 5_000 });
  await expect(b.locator('.box .vote-badge')).not.toHaveClass(/vote-moi/); // pas LE vote de B

  // v4.17.0 — qui a voté : la fiche du jeu nomme A chez B, puis « Toi » en dernier
  await b.locator('.box').first().click();
  const votantsB = b.locator('.bottom-sheet .votants');
  await expect(votantsB).toContainText('👍 1 vote');
  await expect(votantsB).toContainText(`vt_a_${s}`);
  await b.locator('.bottom-sheet .sheet-close').click();
  await b.locator('.box .vote-badge').click();
  await expect(b.locator('.box .vote-badge')).toContainText('2');
  await b.locator('.box').first().click();
  await expect(votantsB).toContainText('👍 2 votes');
  await expect(votantsB.locator('.chip').last()).toContainText('Toi');
  await expect(votantsB.locator('.votant-moi')).toHaveCount(1);
  await ctxA.close();
  await ctxB.close();
});

test('pool : segmenté seulement avec des votes, Votés → Lancer · M, tirage sur les votés', async ({ browser }) => {
  const s = Date.now().toString(36);
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  await register(a, `vp_a_${s}`);
  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await register(b, `vp_b_${s}`);
  await devenirAmis(a, b);
  const nightId = await creerPartie(a, `vp_b_${s}`);

  const g1 = await newGame(a, 'Cascadia', 'grand');
  const g2 = await newGame(a, 'Wingspan', 'moyen');
  await putOnShelf(a, g1, nightId);
  await putOnShelf(a, g2, nightId);
  await a.goto('/etagere');
  await expect(a.locator('body')).toHaveAttribute('data-sync', 'on', { timeout: 15_000 });
  await expect(b.locator('body')).toHaveAttribute('data-sync', 'on', { timeout: 15_000 });

  // A valide : sans vote, la rangée est exactement celle d'aujourd'hui (pill + Lancer · 2)
  await a.getByRole('button', { name: 'Valider ma sélection' }).click();
  await expect(a.locator('.pill-ok')).toContainText('✓ Validée');
  await expect(a.locator('.choix-pool')).toHaveCount(0);
  await expect(a.getByRole('button', { name: 'Lancer · 2' })).toBeVisible();

  // B vote pour Wingspan : chez A, le segmenté remplace la pill (live)
  await b.request.post(`/api/nights/${nightId}/votes`, { data: { gameId: g2 } });
  await expect(a.locator('.choix-pool')).toBeVisible({ timeout: 5_000 });
  await expect(a.locator('.choix-pool button.actif')).toContainText('Tous'); // défaut = tous
  await expect(a.getByRole('button', { name: 'Lancer · 2' })).toBeVisible();

  // « Votés 👍 » → le bouton compte les votés
  await a.locator('.choix-pool button', { hasText: 'Votés' }).click();
  await expect(a.getByRole('button', { name: 'Lancer · 1' })).toBeVisible();

  // B dé-vote : le segmenté disparaît, la pill revient, le lancer retombe sur tous
  await b.request.post(`/api/nights/${nightId}/votes`, { data: { gameId: g2 } });
  await expect(a.locator('.choix-pool')).toHaveCount(0, { timeout: 5_000 });
  await expect(a.locator('.pill-ok')).toContainText('✓ Validée');
  await expect(a.getByRole('button', { name: 'Lancer · 2' })).toBeVisible();

  // B revote les deux boîtes → A choisit « Votés » et lance : la roue reçoit les deux ids
  await b.request.post(`/api/nights/${nightId}/votes`, { data: { gameId: g1 } });
  await b.request.post(`/api/nights/${nightId}/votes`, { data: { gameId: g2 } });
  await expect(a.locator('.choix-pool')).toBeVisible({ timeout: 5_000 });
  await a.locator('.choix-pool button', { hasText: 'Votés' }).click();
  await expect(a.getByRole('button', { name: 'Lancer · 2' })).toBeVisible();
  const tirage = a.waitForURL(new RegExp(`/tirage/${nightId}\\?games=${g1},${g2}$`));
  // B n'a pas validé : idiome v3.0.0 du double-appui « Sûr ? » (avec reprise, cf. helpers/shelf)
  await lancerTirage(a);
  await tirage;
});

test('ajout tardif : la validation saute, le segmenté disparaît, le fantôme compte tous les jeux', async ({ browser }) => {
  const s = Date.now().toString(36);
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  await register(a, `vl_a_${s}`);
  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await register(b, `vl_b_${s}`);
  await devenirAmis(a, b);
  const nightId = await creerPartie(a, `vl_b_${s}`);

  const g1 = await newGame(a, 'Azul', 'grand');
  await putOnShelf(a, g1, nightId);
  await a.goto('/etagere');
  await expect(a.locator('body')).toHaveAttribute('data-sync', 'on', { timeout: 15_000 });
  await expect(b.locator('body')).toHaveAttribute('data-sync', 'on', { timeout: 15_000 });

  // B vote d'abord ; puis A valide → segmenté visible, choisit « Votés 👍 » → Lancer · 1
  await b.request.post(`/api/nights/${nightId}/votes`, { data: { gameId: g1 } });
  await a.getByRole('button', { name: 'Valider ma sélection' }).click();
  await expect(a.locator('.choix-pool')).toBeVisible({ timeout: 5_000 });
  await a.locator('.choix-pool button', { hasText: 'Votés' }).click();
  await expect(a.getByRole('button', { name: 'Lancer · 1' })).toBeVisible();

  // ajout tardif : l'idiome v3.0.0 fait sauter la validation de l'AJOUTEUR (cf.
  // addNightGame — seul l'ajouteur re-valide) → chez A la validation saute :
  // branche « Valider ma sélection », segmenté absent, et le Lancer fantôme
  // compte TOUS les jeux (2) — jamais l'ancien choix « Votés » (1)
  const g2 = await newGame(a, 'Tardif', 'petit');
  await putOnShelf(a, g2, nightId);
  await expect(a.getByRole('button', { name: 'Valider ma sélection' })).toBeVisible({ timeout: 5_000 });
  await expect(a.locator('.choix-pool')).toHaveCount(0);
  await expect(a.getByRole('button', { name: 'Lancer · 2' })).toBeVisible();
});

test('gelé en jeu : plus de badge vote une fois la boîte sortie', async ({ browser }) => {  const s = Date.now().toString(36);
  const page = await browser.newContext().then((c) => c.newPage());
  await register(page, `vg_${s}`);
  const nightId = await creerPartieSolo(page);
  const gid = await newGame(page, '7 Wonders', 'moyen');
  await putOnShelf(page, gid, nightId);
  await page.goto('/etagere');
  await page.locator('.box').first().waitFor();

  await page.getByRole('button', { name: 'Valider ma sélection' }).click();
  await expect(page.locator('.pill-ok')).toContainText('✓ Validée');
  await page.getByRole('button', { name: 'Lancer · 1' }).click();
  await page.waitForURL(/\/tirage\//);

  // sortie de la boîte (l'étagère passe en_jeu) → retour étagère : plus aucun badge
  const out = await page.request.post(`/api/nights/${nightId}/box-out`, { data: { gameId: gid } });
  expect(out.ok()).toBeTruthy();
  await page.goto('/etagere');
  await expect(page.locator('.bandeau.v')).toContainText('est sortie de l');
  await expect(page.locator('.vote-badge')).toHaveCount(0);
});

test('issue #31 : le segmenté du pool tient dans la rangée CTA, le bouton Lancer reste compact', async ({ page }) => {
  test.setTimeout(60_000);
  await register(page, `vc_${Date.now().toString(36)}`);
  const nightDone = page.waitForResponse((r) => r.url().endsWith('/api/nights') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Créer la partie' }).click();
  const { nightId } = await (await nightDone).json() as { nightId: number };

  for (const t of ['Azul', 'Wingspan', 'Cascadia']) {
    const gid = await newGame(page, t, 'moyen');
    await putOnShelf(page, gid, nightId);
  }
  await page.goto('/etagere');
  const gid0 = ((await (await page.request.get('/api/games')).json()) as { games: { id: number }[] }).games[0].id;
  await page.request.post(`/api/nights/${nightId}/votes`, { data: { gameId: gid0 } });
  await page.getByRole('button', { name: 'Valider ma sélection' }).click();
  await page.locator('.choix-pool').waitFor();

  // aux deux largeurs du rapport (Galaxy S22 Ultra 412px) et du pire cas (360px) :
  // ni la rangée CTA ni le segmenté ne débordent, et le Lancer reste compact
  for (const largeur of [412, 360]) {
    await page.setViewportSize({ width: largeur, height: 883 });
    await page.waitForTimeout(200);
    const m = await page.evaluate(() => {
      const row = document.querySelector('.cta-row')!;
      const pool = document.querySelector('.choix-pool')!;
      const btn = document.querySelector('.cta-row .btn-copper')!;
      const cellules = [...document.querySelectorAll('.choix-pool button')];
      return {
        rowDeborde: row.scrollWidth > row.clientWidth,
        poolDeborde: pool.scrollWidth > pool.clientWidth,
        cellulesDebordent: cellules.some((b) => b.scrollWidth > b.clientWidth + 1),
        btnLargeur: Math.round(btn.getBoundingClientRect().width),
      };
    });
    expect(m.rowDeborde, `cta-row déborde à ${largeur}px`).toBe(false);
    expect(m.poolDeborde, `choix-pool déborde à ${largeur}px`).toBe(false);
    expect(m.cellulesDebordent, `cellules débordent à ${largeur}px`).toBe(false);
    expect(m.btnLargeur, `Lancer trop large à ${largeur}px`).toBeLessThanOrEqual(150);
  }
});
