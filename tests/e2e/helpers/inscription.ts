import type { Page } from '@playwright/test';

// v4.18.0 : l'inscription mène à l'étape ② « Tes jeux » (/bienvenue). Les parcours
// qui n'y ajoutent rien la passent, puis reprennent là où l'ancienne inscription
// arrivait — l'étagère, ou le lien d'invitation (?next=) qui a mené à l'inscription.
export async function passerBienvenue(page: Page, { invitation = false } = {}): Promise<void> {
  await page.waitForURL('**/bienvenue**');
  await page.getByRole('button', { name: /^(Passer pour l’instant|Skip for now)$/ }).click();
  if (invitation) { await page.waitForURL((u) => !u.pathname.startsWith('/bienvenue')); return; }
  await page.waitForURL('**/library?bienvenue=1');
  await page.goto('/etagere');
}
