import { test, expect, Page } from '@playwright/test';

// v4.8.0 — parcours complet : lien d'ami → cercle → partie programmée → invitation
// dans l'app → « Dispo » → joueur. Et la liste des joueurs ne montre que les amis.

async function register(page: Page, pseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const reg = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await reg;
  await page.waitForURL('/etagere');
}

test('lien d’ami → cercle → partie programmée → Dispo → joueur', async ({ browser }) => {
  test.setTimeout(90_000); // parcours long : trois comptes, cinq écrans
  const s = Date.now().toString(36);
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  const inconnu = await (await browser.newContext()).newPage();
  await register(a, `ma_${s}`);
  await register(b, `to_${s}`);
  await register(inconnu, `zz_${s}`);

  // Seuls les amis sont proposés : avant l'amitié, A ne voit ni B ni l'inconnu.
  await a.goto('/etagere');
  await expect(a.locator('.player-list')).toContainText(`ma_${s}`);
  await expect(a.locator('.player-list')).not.toContainText(`to_${s}`);

  // A partage son lien d'ami ; B l'ouvre et devient ami en un geste.
  await a.goto('/amis');
  const lien = new URL((await a.locator('.lien-url').textContent())!.trim());
  await b.goto(`${lien.pathname}${lien.search}`);
  await expect(b.getByRole('heading', { name: `ma_${s} t’ajoute en ami` })).toBeVisible();
  await b.getByRole('button', { name: 'Devenir amis' }).click();
  await b.waitForURL('/amis');
  await expect(b.locator('.membres')).toContainText(`ma_${s}`);

  await a.goto('/etagere');
  await expect(a.locator('.player-list')).toContainText(`to_${s}`);
  await expect(a.locator('.player-list')).not.toContainText(`zz_${s}`);

  // A crée un cercle et y ajoute B.
  await a.goto('/amis?s=cercles');
  await a.getByLabel('Nom du cercle').fill('Jeudi');
  await a.getByRole('button', { name: 'Créer' }).click();
  await a.waitForURL(/\/amis\/cercles\/\d+$/);
  await a.getByText('＋ Ajouter des amis au cercle').click();
  await a.getByRole('button', { name: `Ajouter to_${s}` }).click();
  await expect(a.locator('.qg-section .membres')).toContainText(`to_${s}`);

  // A programme une partie en invitant le cercle.
  await a.goto('/nights');
  await a.getByRole('button', { name: '＋ Nouvelle partie' }).click();
  const d = new Date(); d.setDate(d.getDate() + 3);
  await a.getByLabel('Date').fill(d.toLocaleDateString('sv-SE'));
  await a.locator('.player-list label', { hasText: 'Jeudi' }).locator('input').check();
  await expect(a.getByText('1 invitation sera envoyée dans l’app.')).toBeVisible();
  await a.getByRole('button', { name: 'Programmer et inviter' }).click();
  await expect(a.locator('.decompte')).toContainText('1 sans réponse');

  // B reçoit l'invitation (pastille sur Parties), répond Dispo : il devient joueur.
  await b.goto('/nights');
  await expect(b.getByLabel('1 invitation sans réponse')).toBeVisible();
  const invitation = b.locator('.rsvp');
  await expect(invitation).toContainText('via le cercle Jeudi');
  await invitation.getByRole('button', { name: '✓ Dispo' }).click();
  await expect(b.locator('.rsvp')).toHaveCount(0);
  await expect(b.locator('.planned-card')).toContainText(`ma_${s}`);
  await expect(b.getByLabel('1 invitation sans réponse')).toHaveCount(0);

  await a.reload();
  await expect(a.locator('.decompte')).toContainText('1 dispo');
  await expect(a.locator('.planned-card .chips')).toContainText(`to_${s}`);
});
