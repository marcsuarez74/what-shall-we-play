import { test, expect } from '@playwright/test';

// Foyer : création, adhésion par code, fusion guidée des doublons,
// collection commune (ludothèque + étagère), sortie du foyer.
const stamp = Date.now().toString(36);

async function register(page: import('@playwright/test').Page, pseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const reg = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await reg;
}

async function addGame(page: import('@playwright/test').Page, title: string, format: string) {
  const form = new FormData();
  form.set('title', title); form.set('box_format', format);
  const res = await page.request.post('/api/games', { form });
  if (!res.ok()) throw new Error(`ajout ${title}: ${res.status()} ${await res.text()}`);
}

test('foyer : créer, rejoindre par code, fusion guidée, collection commune, sortie', async ({ browser }) => {
  // — Marc crée son foyer (ses jeux passent dans la collection commune)
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  await register(a, `foyA-${stamp}`);
  await addGame(a, 'Azul', 'moyen');
  await a.goto('/profil');
  await a.getByRole('button', { name: 'Créer un foyer' }).click();
  const codeZone = a.locator('.code-zone .code');
  await expect(codeZone).toBeVisible();
  const code = (await codeZone.innerText()).trim();
  expect(code).toHaveLength(6);
  await expect(a.locator('.foyer-name')).toContainText(`Chez foyA-${stamp}`);
  await expect(a.locator('.member')).toHaveCount(1);

  // — Léa rejoint avec le code (dicté, casse libre) ; elle a un doublon d'Azul
  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await register(b, `foyB-${stamp}`);
  await addGame(b, 'azûl', 'petit'); // titre accentué : doublon au titre normalisé
  await addGame(b, 'Harmonies', 'moyen');
  await b.goto('/profil');
  await b.getByRole('button', { name: 'Rejoindre avec un code' }).click();
  await b.getByLabel('Code du foyer').fill(code.toLowerCase());
  await b.getByRole('button', { name: 'Rejoindre' }).click();

  // — Fusion guidée : 1 doublon, elle garde sa fiche
  await expect(b.getByText('1 doublon à trier')).toBeVisible();
  await b.getByRole('button', { name: `Garder celle de foyB-${stamp}` }).click();
  await expect(b.getByText('Bibliothèques fusionnées')).toBeVisible();
  await expect(b.getByText('1 doublon retiré')).toBeVisible();
  await b.getByRole('button', { name: 'Voir ma ludothèque' }).click();

  // — Collection commune : deux fiches chez Léa (Azul gardée + Harmonies)…
  await b.goto('/library');
  await expect(b.locator('.foyer-line')).toContainText('2 membres');
  await expect(b.locator('.lib-card')).toHaveCount(2);
  // …et les mêmes chez Marc, avec le badge de l'ajouteuse (initiale : pas de sticker sur ce compte)
  await a.goto('/library');
  await expect(a.locator('.lib-card')).toHaveCount(2);
  await expect(a.locator('.lib-cover .who').first()).toHaveText('F');

  // — Étagère : une soirée où Léa est absente porte quand même la collection du foyer
  await a.goto('/etagere');
  await a.getByRole('button', { name: 'Créer la soirée' }).click();
  await a.waitForURL('/etagere');
  await expect(a.locator('.shelf-block:not(.excluded-block) .box')).toHaveCount(2);

  // — Léa quitte : ses ajouts la suivent, y compris l'Azul gardée à la fusion
  //   (la fiche conservée appartient à celui dont elle est) ; Marc garde le
  //   foyer mais sa fiche d'Azul avait été absorbée — bibliothèque vide.
  await b.goto('/profil');
  await b.getByRole('button', { name: 'Quitter le foyer' }).click();
  await b.getByRole('button', { name: 'Sûr ? Quitter' }).click();
  await expect(b.locator('.foyer-card.solo')).toBeVisible();
  await b.goto('/library');
  await expect(b.locator('.lib-card')).toHaveCount(2); // Azul (à elle) + Harmonies
  await a.goto('/library');
  await expect(a.locator('.lib-card')).toHaveCount(0); // fiche absorbée au profit de celle de Léa
  await expect(a.locator('.empty')).toBeVisible();
  await ctxA.close();
  await ctxB.close();
});

test('dissoudre : réservé au créateur ; le dernier départ supprime le foyer', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  await register(a, `foyC-${stamp}`);
  await a.goto('/profil');
  await a.getByRole('button', { name: 'Créer un foyer' }).click();
  await expect(a.locator('.code-zone')).toBeVisible();
  // le créateur voit « Dissoudre le foyer », avec double-tap de confirmation
  await a.getByRole('button', { name: 'Dissoudre le foyer' }).click();
  await a.getByRole('button', { name: 'Sûr ? Dissoudre' }).click();
  await expect(a.locator('.foyer-card.solo')).toBeVisible();
  await ctxA.close();
});
