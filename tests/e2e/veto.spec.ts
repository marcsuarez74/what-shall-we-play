import { test, expect, Page } from '@playwright/test';
import { newGame, putOnShelf } from './helpers/shelf';
import { passerBienvenue } from './helpers/inscription';

// v4.13.0 — le veto ❌ depuis la fiche du jeu : boîte grisée et nommée, sortie du pool,
// un seul veto par joueur, révocable.

async function registerAndStart(page: Page, pseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const reg = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await reg;
  await passerBienvenue(page);
  const nightDone = page.waitForResponse((r) => r.url().endsWith('/api/nights') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Créer la partie' }).click();
  const { nightId } = await (await nightDone).json() as { nightId: number };
  await page.waitForURL('/etagere');
  return nightId;
}

test('veto : depuis la fiche, la boîte est écartée du tirage, un seul veto, révocable', async ({ page }) => {
  const pseudo = `veto_${Date.now()}`;
  const nightId = await registerAndStart(page, pseudo);
  const gloom = await newGame(page, 'Gloomhaven', 'grand');
  const azul = await newGame(page, 'Azul', 'moyen');
  const kd = await newGame(page, 'Kingdomino', 'petit');
  for (const id of [gloom, azul, kd]) await putOnShelf(page, id, nightId);
  await page.goto('/etagere');
  await page.getByRole('button', { name: 'Valider ma sélection' }).click();
  await expect(page.getByRole('button', { name: 'Lancer · 3' })).toBeVisible();

  // Une boîte par format : rangées grand (Gloomhaven), moyen (Azul), petit (Kingdomino).
  const boite = (i: number) => page.locator('.shelf-block .box').nth(i);

  // Toucher la boîte → fiche → ❌ Mettre un veto.
  await boite(0).click();
  const fiche = page.getByRole('dialog', { name: 'Gloomhaven' });
  await expect(fiche).toContainText('1 veto par joueur');
  await fiche.getByRole('button', { name: /Mettre un veto/ }).click();
  await expect(fiche).toHaveCount(0);

  // Boîte grisée, badge nommé, pool réduit, rappel sous Lancer.
  await expect(boite(0)).toHaveClass(/veto/);
  await expect(boite(0).locator('.veto-badge')).toContainText(`❌ ${pseudo}`);
  await expect(page.getByRole('button', { name: 'Lancer · 2' })).toBeVisible();
  await expect(page.locator('.cta-statut')).toContainText('1 jeu écarté par veto');

  // Un 2ᵉ veto est refusé tant que le premier n'est pas retiré.
  await boite(1).click();
  const ficheAzul = page.getByRole('dialog', { name: 'Azul' });
  await expect(ficheAzul.getByRole('button', { name: /Mettre un veto/ })).toBeDisabled();
  await expect(ficheAzul).toContainText('Tu as déjà utilisé ton veto (Gloomhaven)');
  await ficheAzul.getByRole('button', { name: 'Fermer' }).click();

  // Le tirage ne porte que les jeux non vetoés.
  const href = page.waitForURL(/\/tirage\//);
  await page.getByRole('button', { name: 'Lancer · 2' }).click();
  await href;
  const ids = new URL(page.url()).searchParams.get('games')!.split(',').map(Number).sort();
  expect(ids).toEqual([azul, kd].sort());

  // Retour : retirer son veto remet le jeu dans le pool.
  await page.goto('/etagere');
  await boite(0).click();
  await page.getByRole('dialog', { name: 'Gloomhaven' }).getByRole('button', { name: /Retirer mon veto/ }).click();
  await expect(boite(0)).not.toHaveClass(/veto/);
  await expect(page.getByRole('button', { name: 'Lancer · 3' })).toBeVisible();
});
