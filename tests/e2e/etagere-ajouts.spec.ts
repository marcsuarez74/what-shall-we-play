import { test, expect } from '@playwright/test';
import { devenirAmiDe } from './helpers/amis';
import { makePng } from './helpers/png';
import { newGame, putOnShelf } from './helpers/shelf';

// v2.0.0 — Étagère vide à la création : chacun ajoute depuis SA ludothèque
// (sélecteur), et « Pas ce soir » a laissé place au « Retirer de la partie ».
// Les filtres de l'étagère et de la bibliothèque sont couverts plus bas.

async function registerAndStart(page: import('@playwright/test').Page, pseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const reg = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await reg;
  const nightDone = page.waitForResponse((r) => r.url().endsWith('/api/nights') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Créer la partie' }).click();
  const { nightId } = await (await nightDone).json() as { nightId: number };
  await page.waitForURL('/etagere');
  return nightId;
}

test('étagère vide à la création, le sélecteur ajoute depuis ma ludothèque', async ({ page }) => {
  await registerAndStart(page, `eav3_${Date.now()}`);
  await newGame(page, 'Azul', 'moyen');
  await newGame(page, 'Jaipur', 'petit');
  await page.goto('/etagere');

  // État vide explicite (le cœur du flux v3)
  await expect(page.locator('.empty-shelf')).toBeVisible();
  await expect(page.locator('.empty-shelf h3')).toContainText('L\'étagère est vide');

  // Le CTA ouvre le sélecteur : mes jeux, groupés par format, recherche à accents libres
  await page.getByRole('button', { name: 'Ajouter des jeux depuis ma ludothèque' }).click();
  const sheet = page.locator('.picker-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.pick-row')).toHaveCount(2);
  await sheet.getByLabel('Rechercher un jeu').fill('azul'); // insensible à la casse
  await expect(sheet.locator('.pick-row')).toHaveCount(1);
  await sheet.getByLabel('Rechercher un jeu').fill('');

  // Un tap = un ajout (✓ vert), le compteur suit ; « Terminé » referme
  await sheet.getByRole('button', { name: /Ajouter Azul/ }).click();
  await expect(sheet.locator('.count')).toContainText('1 jeu ajouté');
  await sheet.getByRole('button', { name: /Ajouter Jaipur/ }).click();
  await expect(sheet.locator('.count')).toContainText('2 jeux ajoutés');
  await sheet.getByRole('button', { name: 'Terminé' }).click();
  await expect(page.locator('.shelf-block .box')).toHaveCount(2);

  // Réouverture : Azul est déjà sur l'étagère (✓), le tap la retire
  await page.locator('.add-more .link-btn').click();
  await expect(sheet).toBeVisible();
  const azul = sheet.getByRole('button', { name: /Retirer Azul/ });
  await azul.click();
  await expect(sheet.locator('.count')).toContainText('1 jeu ajouté');
  await sheet.getByRole('button', { name: 'Terminé' }).click();
  await expect(page.locator('.shelf-block .box')).toHaveCount(1);
});

test('sync live : le jeu ajouté par un joueur apparaît chez les autres sans recharger', async ({ browser }) => {
  const s = Date.now().toString(36);
  // Léa existe AVANT que la page de Marc liste les joueurs
  const other = await browser.newContext();
  await other.request.post('/api/auth/register', { data: { pseudo: `sync_l_${s}`, code: '1234', sticker: '🌙' } });

  // Marc s'inscrit (UI) et crée la partie avec Léa
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  await a.goto('/register');
  await a.getByLabel('Pseudo').fill(`sync_m_${s}`);
  await a.getByLabel('Code secret').fill('1234');
  const reg = a.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await a.getByRole('button', { name: 'Créer mon compte' }).click();
  await reg;
  await a.waitForURL('/etagere'); await devenirAmiDe(a, `sync_l_${s}`); await a.reload();
  await a.getByLabel(new RegExp(`sync_l_${s}`)).check();
  const nightDone = a.waitForResponse((r) => r.url().endsWith('/api/nights') && r.request().method() === 'POST');
  await a.getByRole('button', { name: 'Créer la partie' }).click();
  const { nightId } = await (await nightDone).json() as { nightId: number };
  await a.waitForURL('/etagere');
  await expect(a.locator('.empty-shelf')).toBeVisible(); // étagère vide, ShelfClient monté
  // Le flux SSE de Marc est connecté (sinon l'événement de Léa serait perdu)
  await expect(a.locator('body')).toHaveAttribute('data-sync', 'on', { timeout: 15_000 });

  // Léa, de son téléphone (API seule), pose un jeu…
  const form = new FormData();
  form.set('title', 'Sync live'); form.set('box_format', 'moyen');
  const g = await other.request.post('/api/games', { form });
  if (!g.ok()) throw new Error(`jeu léa: ${g.status()}`);
  const gid = ((await g.json()) as { id: number }).id;
  const put = await other.request.post(`/api/nights/${nightId}/games`, { data: { gameId: gid, added: true } });
  if (!put.ok()) throw new Error(`pose étagère: ${put.status()}`);

  // …et la boîte apparaît chez Marc SANS aucun rechargement (SSE)
  await expect(a.locator('.shelf-block .box')).toHaveCount(1, { timeout: 5000 });
  await other.close();
  await ctxA.close();
});

test('ajouter un joueur : sa page ouverte bascule sur la partie en cours (sync)', async ({ browser }) => {
  const s = Date.now().toString(36);

  // Léa s'inscrit (UI) : sa page reste ouverte sur l'écran « nouvelle partie »
  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await b.goto('/register');
  await b.getByLabel('Pseudo').fill(`add_l_${s}`);
  await b.getByLabel('Code secret').fill('1234');
  const regB = b.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await b.getByRole('button', { name: 'Créer mon compte' }).click();
  await regB;
  await b.waitForURL('/etagere');
  await expect(b.locator('.player-list')).toBeVisible(); // elle n'a pas de partie
  // Son flux SSE est connecté avant que Marc ne crée la partie
  await expect(b.locator('body')).toHaveAttribute('data-sync', 'on', { timeout: 15_000 });

  // Marc s'inscrit et crée la partie AVEC Léa (cochée à la création)
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  await a.goto('/register');
  await a.getByLabel('Pseudo').fill(`add_m_${s}`);
  await a.getByLabel('Code secret').fill('1234');
  const regA = a.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await a.getByRole('button', { name: 'Créer mon compte' }).click();
  await regA;
  await a.waitForURL('/etagere'); await devenirAmiDe(a, `add_l_${s}`); await a.reload();
  await a.getByLabel(new RegExp(`add_l_${s}`)).check();
  const nightDone = a.waitForResponse((r) => r.url().endsWith('/api/nights') && r.request().method() === 'POST');
  await a.getByRole('button', { name: 'Créer la partie' }).click();
  const { nightId } = await (await nightDone).json() as { nightId: number };

  // La page de Léa, restée sur « nouvelle partie », bascule TOUTE SEULE
  await expect(b.locator('.night-card')).toBeVisible({ timeout: 5000 });
  await expect(b.locator('.night-card')).toContainText('En préparation'); // v3.3 : badge d'état
  await expect(b.locator('.night-card')).toContainText(`add_l_${s}`);

  // Marc pose un jeu : Léa le voit apparaître aussi, sans recharger
  const form = new FormData();
  form.set('title', 'Ajoutée à chaud'); form.set('box_format', 'moyen');
  const g = await a.request.post('/api/games', { form });
  if (!g.ok()) throw new Error(`jeu marc: ${g.status()}`);
  const gid = ((await g.json()) as { id: number }).id;
  const put = await a.request.post(`/api/nights/${nightId}/games`, { data: { gameId: gid, added: true } });
  if (!put.ok()) throw new Error(`pose étagère: ${put.status()}`);
  await expect(b.locator('.shelf-block .box')).toHaveCount(1, { timeout: 5000 });
  await ctxA.close();
  await ctxB.close();
});

test('retirer de la partie : depuis la fiche, l\'étagère redevient vide', async ({ page }) => {
  const nightId = await registerAndStart(page, `retv3_${Date.now()}`);
  await putOnShelf(page, await newGame(page, 'Alpha', 'grand'), nightId);
  await putOnShelf(page, await newGame(page, 'Bravo', 'petit'), nightId);
  await page.goto('/etagere');
  await expect(page.locator('.shelf-block .box')).toHaveCount(2);

  // Fiche d'Alpha → « Retirer de la partie » (remplace « Pas ce soir »)
  await page.locator('.shelf-block .box').first().click();
  await expect(page.locator('.bottom-sheet')).toBeVisible();
  const post = page.waitForResponse((r) => r.url().includes('/games') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Retirer de la partie' }).click();
  await post;
  await expect(page.locator('.shelf-block .box')).toHaveCount(1);

  // Un seul jeu restant, retiré à son tour → état vide
  await page.locator('.shelf-block .box').first().click();
  await page.getByRole('button', { name: 'Retirer de la partie' }).click();
  await expect(page.locator('.empty-shelf')).toBeVisible();
  // v3.0.0 : sans boîte, plus de lanceur — mais la validation reste possible
  await expect(page.getByRole('button', { name: 'Valider ma sélection' })).toBeVisible();
});

test('étagère : spinner pendant le chargement des pochettes', async ({ browser }) => {
  // SW bloqué : sans ça, il sert les pochettes et la route de test ne voit rien
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  const nightId = await registerAndStart(page, `spin_${Date.now()}`);
  const form = new FormData();
  form.set('title', 'Pochette lente'); form.set('box_format', 'moyen');
  const res = await page.request.post('/api/games', {
    multipart: {
      title: 'Pochette lente', box_format: 'moyen',
      cover: { name: 'cover.png', mimeType: 'image/png', buffer: makePng(8, 8) },
    },
  });
  if (!res.ok()) throw new Error(`ajout jeu: ${res.status()} ${await res.text()}`);
  await putOnShelf(page, ((await res.json()) as { id: number }).id, nightId);

  // La pochette met du temps à arriver (réseau lent simulé par interception)
  await page.route('**/api/cover/**', async (route) => {
    await new Promise((r) => setTimeout(r, 900));
    await route.fulfill({ status: 200, contentType: 'image/png', body: makePng(8, 8) });
  });

  // DCL avant les images : on observe le spinner PENDANT le chargement de la pochette
  await page.goto('/etagere', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.box-spin').first()).toBeVisible();
  await expect(page.locator('.box img.on')).toHaveCount(0);
  // une fois chargée : la pochette apparaît en fondu, le spinner disparaît
  await expect(page.locator('.box img.on')).toHaveCount(1);
  await expect(page.locator('.box-spin')).toHaveCount(0);
  await context.close();
});

test('étagère : pochette visible dès le montage quand le cache SW sert l’image (revisite)', async ({ page }) => {
  const nightId = await registerAndStart(page, `swimg_${Date.now()}`);
  const res = await page.request.post('/api/games', {
    multipart: { title: 'Cache chaud', box_format: 'moyen', cover: { name: 'c.png', mimeType: 'image/png', buffer: makePng(8, 8) } },
  });
  if (!res.ok()) throw new Error(`ajout: ${res.status()}`);
  await putOnShelf(page, ((await res.json()) as { id: number }).id, nightId);

  await page.goto('/etagere'); // 1re visite : remplit le cache du service worker
  await expect(page.locator('.box img.on')).toHaveCount(1);
  await page.goto('/etagere'); // 2e visite : le SW sert la pochette AVANT l'hydratation
  await page.waitForTimeout(800);
  await expect(page.locator('.box img.on')).toHaveCount(1);  // ROUGE : opacity 0 à vie
  await expect(page.locator('.box-spin')).toHaveCount(0);    // ROUGE : spinner infini
});

test('étagère : recherche et filtres (joueurs pré-rempli, complexité, durée)', async ({ page }) => {
  const nightId = await registerAndStart(page, `flt_${Date.now()}`);
  await putOnShelf(page, await newGame(page, 'Azul', 'moyen', { min_players: '2', max_players: '4', playtime_min: '35', weight: '1.7' }), nightId);
  await putOnShelf(page, await newGame(page, 'Terraforming Mars', 'grand', { min_players: '1', max_players: '5', playtime_min: '120', weight: '3.4' }), nightId);
  await putOnShelf(page, await newGame(page, 'Jaipur', 'petit', { min_players: '2', max_players: '2', playtime_min: '30', weight: '1.5' }), nightId);
  await page.goto('/etagere');

  // Aucun filtre par défaut : les 3 boîtes sont là
  await page.getByRole('button', { name: /Filtres/ }).click(); // panneau replié par défaut
  const chip1 = page.locator('.fam[aria-label*="joueurs"] .fchip', { hasText: '1' });
  await expect(page.locator('.shelf-block .box')).toHaveCount(3);
  await expect(page.locator('.shelf-count')).toContainText('3 jeux sur 3');

  // Le filtre joueurs reste disponible : en solo, seul Mars (1–5) reste
  await chip1.click();
  await expect(page.locator('.shelf-block .box')).toHaveCount(1);

  // Le retirer → les 3 reviennent
  await chip1.click();
  await expect(page.locator('.shelf-block .box')).toHaveCount(3);

  // Recherche insensible à la casse
  await page.getByLabel('Rechercher un jeu').fill('azul');
  await expect(page.locator('.shelf-block .box')).toHaveCount(1);
  await page.getByLabel('Rechercher un jeu').fill('');

  // Complexité lourde → Mars
  await page.getByRole('button', { name: 'Lourde' }).click();
  await expect(page.locator('.shelf-block .box')).toHaveCount(1);
  await page.getByRole('button', { name: 'Lourde' }).click();

  // Durée 90+ → Mars (v4.12.0 : 4 plages, l'unité est dans le libellé « Durée (min) »)
  await page.getByRole('button', { name: '90+', exact: true }).click();
  await expect(page.locator('.shelf-block .box')).toHaveCount(1);
});

test('étagère : badge « apporté par » = qui a posé la boîte', async ({ page }) => {
  const pseudo = `bdg_${Date.now()}`;
  const nightId = await registerAndStart(page, pseudo);
  // sticker de l'ajouteur (pas de photo : c'est lui qui doit apparaître)
  await page.request.patch('/api/me', { data: { sticker: '🦊' } });
  await putOnShelf(page, await newGame(page, 'Avec badge', 'moyen'), nightId);
  await page.goto('/etagere');

  const badge = page.locator('.owner-badge').first();
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute('title', `Apporté par ${pseudo}`);
  await expect(badge).toContainText('🦊');
  expect(await badge.evaluate((el) => getComputedStyle(el).width)).toBe('16px');
});

test('badge : la photo de l\'ajouteur est visible (pas avalée par l’opacité de la pochette)', async ({ page }) => {
  const pseudo = `bdgph_${Date.now()}`;
  const nightId = await registerAndStart(page, pseudo);
  const png = makePng(4, 4);
  const up = await page.request.post('/api/me/avatar', {
    multipart: { avatar: { name: 'p.png', mimeType: 'image/png', buffer: png } },
  });
  if (!up.ok()) throw new Error(`avatar: ${up.status()}`);
  await putOnShelf(page, await newGame(page, 'Avec photo', 'moyen'), nightId);
  await page.goto('/etagere');

  const img = page.locator('.owner-badge img').first();
  await expect(img).toBeVisible();
  // L'opacité de la pochette (.box img) ne doit pas s'appliquer à l'img du badge
  expect(await img.evaluate((el) => getComputedStyle(el).opacity)).toBe('1'); // ROUGE avant fix
});

test('bibliothèque : recherche, filtres (dont Boîte) et compteur', async ({ page }) => {
  await registerAndStart(page, `libf_${Date.now()}`);
  const add = async (title: string, meta: Record<string, string>) => {
    const r = await page.request.post('/api/games', { multipart: { title, box_format: 'moyen', ...meta } });
    if (!r.ok()) throw new Error(`ajout ${title}: ${r.status()}`);
  };
  await add('Azul', { min_players: '2', max_players: '4', playtime_min: '35', weight: '1.7' });
  await add('Terraforming Mars', { min_players: '1', max_players: '5', playtime_min: '120', weight: '3.4', box_format: 'grand' });
  await add('Jaipur', { min_players: '2', max_players: '2', playtime_min: '30', weight: '1.5', box_format: 'petit' });
  await page.goto('/library');

  // Panneau de filtres replié par défaut : on le déplie pour la famille Boîte
  await page.getByRole('button', { name: /Filtres/ }).click();

  // Recherche insensible à la casse
  await page.getByLabel('Rechercher un jeu').fill('azul');
  await expect(page.locator('.lib-card')).toHaveCount(1);
  await page.getByLabel('Rechercher un jeu').fill('');

  // Filtre Boîte (dimension propre à la ludothèque)
  await page.locator('.fam[aria-label*="boîte"] .fchip', { hasText: 'Petit' }).click();
  await expect(page.locator('.lib-card')).toHaveCount(1);
  await page.locator('.fam[aria-label*="boîte"] .fchip', { hasText: 'Mini' }).click();
  await expect(page.locator('.lib-card')).toHaveCount(0);
  await expect(page.locator('.lib-empty')).toBeVisible();
  // Reset : « Tout afficher »
  await page.getByRole('button', { name: 'Tout afficher' }).click();
  await expect(page.locator('.lib-card')).toHaveCount(3);
});

// v3.0.0 — repro du signal du 2026-10-01 : « l'ajout d'un joueur à une partie
// ne lui fait pas voir les jeux présents sur l'étagère ». La joueuse ajoutée
// ENSUITE (via modifier) doit voir la partie ET les jeux posés AVANT son arrivée.
test('joueur ajouté ensuite via modifier : elle voit la partie et les jeux déjà posés', async ({ browser }) => {
  const s = Date.now().toString(36);
  // Léa s'inscrit et reste sur l'écran « nouvelle partie », flux connecté
  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await b.goto('/register');
  await b.getByLabel('Pseudo').fill(`mod_l_${s}`);
  await b.getByLabel('Code secret').fill('1234');
  const regB = b.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await b.getByRole('button', { name: 'Créer mon compte' }).click();
  await regB;
  await b.waitForURL('/etagere');
  await expect(b.locator('.player-list')).toBeVisible();
  await expect(b.locator('body')).toHaveAttribute('data-sync', 'on', { timeout: 15_000 });

  // Marc crée une partie SANS elle, pose 2 jeux, PUIS l'ajoute via « modifier »
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  await a.goto('/register');
  await a.getByLabel('Pseudo').fill(`mod_m_${s}`);
  await a.getByLabel('Code secret').fill('1234');
  const regA = a.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await a.getByRole('button', { name: 'Créer mon compte' }).click();
  await regA;
  const nightDone = a.waitForResponse((r) => r.url().endsWith('/api/nights') && r.request().method() === 'POST');
  await a.getByRole('button', { name: 'Créer la partie' }).click();
  const { nightId } = await (await nightDone).json() as { nightId: number };
  await putOnShelf(a, await newGame(a, 'Posé avant elle 1', 'grand'), nightId);
  await putOnShelf(a, await newGame(a, 'Posé avant elle 2', 'petit'), nightId);

  await devenirAmiDe(a, `mod_l_${s}`); // v4.8.0 : seuls les amis sont proposés
  await a.reload(); // la liste des joueurs est rendue côté serveur : léa apparaît
  await a.getByRole('button', { name: 'modifier' }).click();
  await a.locator('.player-list label', { hasText: `mod_l_${s}` }).locator('input').check();
  await a.getByRole('button', { name: 'Enregistrer' }).click();

  // La page de Léa, restée ouverte, bascule toute seule : partie + les 2 jeux DÉJÀ posés
  await expect(b.locator('.night-card')).toBeVisible({ timeout: 5_000 });
  await expect(b.locator('.night-card')).toContainText('En préparation'); // v3.3 : badge d'état
  await expect(b.locator('.night-card')).toContainText(`mod_l_${s}`);
  await expect(b.locator('.shelf-block .box')).toHaveCount(2);
  await expect(b.getByRole('button', { name: '+ Ajouter d\'autres jeux' })).toBeVisible();

  // Et une ouverture fraîche de son côté montre la même chose
  await b.reload();
  await expect(b.locator('.night-card')).toContainText('En préparation'); // v3.3 : badge d'état
  await expect(b.locator('.shelf-block .box')).toHaveCount(2);
  await ctxA.close();
  await ctxB.close();
});

// v3.1 — repro du signal du 2026-10-01 : « quand on ajoute des jeux à l'étagère
// depuis le bottomsheet il y a un scroll sur la ligne du jeu ». Ajouter ne doit
// JAMAIS faire sauter le défilement de la feuille.
test('picker : ajouter un jeu ne fait pas sauter le défilement de la feuille', async ({ page }) => {
  await registerAndStart(page, `scroll_${Date.now()}`);
  for (let i = 1; i <= 8; i++) await newGame(page, `Rangement ${i}`, i % 2 ? 'moyen' : 'petit');
  await page.goto('/etagere');
  await page.getByRole('button', { name: 'Ajouter des jeux depuis ma ludothèque' }).click();
  const sheet = page.locator('.picker-sheet');
  await sheet.locator('.pick-row').first().waitFor();

  const descend = () => page.evaluate(() => {
    const s = document.querySelector('.picker-sheet') as HTMLElement;
    const l = document.querySelector('.pick-list') as HTMLElement;
    s.scrollTop = s.scrollHeight; l.scrollTop = l.scrollHeight;
    return s.scrollTop + l.scrollTop;
  });
  const avant = await descend();
  expect(avant).toBeGreaterThan(40); // la feuille défile vraiment

  const post = page.waitForResponse((r) => r.url().includes('/nights/') && r.request().method() === 'POST');
  await sheet.locator('.pick-row').last().getByRole('button', { name: /Ajouter/ }).click();
  await post;
  await page.waitForResponse((r) => r.url().includes('/etagere') && r.request().method() === 'GET'); // le refresh RSC
  const apres = await page.evaluate(() => {
    const s = document.querySelector('.picker-sheet') as HTMLElement;
    const l = document.querySelector('.pick-list') as HTMLElement;
    return s.scrollTop + l.scrollTop;
  });
  expect(Math.abs(apres - avant)).toBeLessThan(10); // le défilement n'a pas bougé
});

// v3.2 — deux signaux joueurs : un scroll horizontal parasite sur la feuille
// (zoom iOS sur les champs < 16px + contenu plus large que la liste), et les
// filtres de l'étagère absents de la liste du sélecteur.
test('picker : aucun défilement horizontal, même avec un titre interminable', async ({ page }) => {
  await registerAndStart(page, `hscrol_${Date.now()}`);
  await newGame(page, 'SuperLongTitreDeJeuSansAucunEspaceInterneVraimentTresLargePourDeborderLaFeuille', 'moyen');
  for (let i = 1; i <= 3; i++) await newGame(page, `Rangement ${i}`, 'petit');
  await page.goto('/etagere');
  await page.getByRole('button', { name: 'Ajouter des jeux depuis ma ludothèque' }).click();
  const sheet = page.locator('.picker-sheet');
  await sheet.locator('.pick-row').first().waitFor();

  const debordements = await page.evaluate(() => {
    const liste = document.querySelector('.pick-list') as HTMLElement;
    const feuille = document.querySelector('.picker-sheet') as HTMLElement;
    const doc = document.documentElement;
    return {
      liste: liste.scrollWidth - liste.clientWidth,
      feuille: feuille.scrollWidth - feuille.clientWidth,
      page: doc.scrollWidth - doc.clientWidth,
    };
  });
  expect(debordements.liste).toBeLessThanOrEqual(0);
  expect(debordements.feuille).toBeLessThanOrEqual(0);
  expect(debordements.page).toBeLessThanOrEqual(0);
  // les champs font au moins 16px : iOS ne zoome pas au focus (pas de faux scroll horizontal)
  const fontSize = await sheet.locator('.shelf-search').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fontSize).toBeGreaterThanOrEqual(16);
});

test('picker : les filtres de l\'étagère s\'appliquent à la liste', async ({ page }) => {
  await registerAndStart(page, `filtre_${Date.now()}`);
  await newGame(page, 'Grand Jeu Lourd', 'grand', { playtime_min: '120', weight: '3.4', min_players: '3', max_players: '5' });
  await newGame(page, 'Petit Jeu Rapide', 'petit', { playtime_min: '20', weight: '1.3', min_players: '2', max_players: '4' });
  await page.goto('/etagere');
  await page.getByRole('button', { name: 'Ajouter des jeux depuis ma ludothèque' }).click();
  const sheet = page.locator('.picker-sheet');
  await sheet.locator('.pick-row').first().waitFor();

  // Filtre par format : « Boîte : Petit » → une seule rangée
  await sheet.getByRole('button', { name: 'Filtres' }).click();
  await sheet.getByRole('group', { name: 'Filtrer par format de boîte' }).getByRole('button', { name: 'Petit' }).click();
  await expect(sheet.locator('.pick-row')).toHaveCount(1);
  await expect(sheet.locator('.pick-row').first()).toContainText('Petit Jeu Rapide');

  // Compteur cohérent + « Tout afficher » ramène les deux
  await expect(sheet.locator('.shelf-count')).toContainText('1 jeu sur 2');
  await sheet.getByRole('button', { name: 'Tout afficher' }).click();
  await expect(sheet.locator('.pick-row')).toHaveCount(2);
});
