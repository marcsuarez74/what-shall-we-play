import { test, expect } from '@playwright/test';

// Parcours invité complet (v4.6.0) : l'hôte crée une soirée, l'invité rejoint
// par le lien sans compte, vote, se restaure silencieusement, puis est retiré
// par l'hôte — sa connexion devient impossible et sa session meurt.
test('invité : lien → joint → vote → restauré → retiré → connexion impossible', async ({ browser }) => {
  const stamp = Date.now().toString(36);
  const titre = `Ambiance${stamp}`;
  const invitee = `Sophie ${stamp}`;

  const hote = await browser.newContext();
  const pageH = await hote.newPage();

  // ── l'hôte s'inscrit, ajoute un jeu, crée la soirée ──
  await pageH.goto('/register');
  await pageH.getByLabel('Pseudo').fill(`invh_${stamp}`);
  await pageH.getByLabel('Code secret').fill('1234');
  await pageH.getByRole('button', { name: 'Créer mon compte' }).click();
  await pageH.waitForURL('**/etagere');

  await pageH.goto('/games/add');
  await pageH.getByLabel('Titre du jeu').fill(titre);
  await pageH.getByRole('button', { name: 'Saisir à la main' }).click();
  await pageH.locator('input[type="file"]').setInputFiles('tests/fixtures/cover-portrait.jpg');
  await pageH.getByRole('button', { name: 'Ajouter à la ludothèque' }).click();
  await expect(pageH).toHaveURL(/\/etagere$/);

  await pageH.getByRole('button', { name: 'Créer la partie' }).click();
  await expect(pageH.locator('.chips').first()).toBeVisible();
  // étagère vide à la création : l'hôte ajoute son jeu depuis sa ludothèque
  await pageH.getByRole('button', { name: 'Ajouter des jeux depuis ma ludothèque' }).click();
  const sheet = pageH.locator('.picker-sheet');
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: new RegExp(`Ajouter ${titre}`) }).click();
  await sheet.getByRole('button', { name: 'Terminé' }).click();
  await expect(pageH.locator('.box').first()).toBeVisible();

  // ── le lien d'invitation se lit dans la soirée de l'hôte (API, session hôte) ──
  const data = await (await pageH.request.get('/api/nights')).json();
  expect(data.night).toBeTruthy();
  expect(data.night.lien_token).toMatch(/^[0-9a-f]{32}$/);
  const lien = `/nights/${data.night.id}/rejoindre?k=${data.night.lien_token}`;

  // ── l'invité ouvre le lien, donne son prénom, rejoint ──
  const invite = await browser.newContext();
  const pageI = await invite.newPage();
  await pageI.goto(lien);
  await expect(pageI.getByLabel('Ton prénom (ou ton surnom de table)')).toBeVisible();
  await pageI.getByLabel('Ton prénom (ou ton surnom de table)').fill(invitee);
  await pageI.getByRole('button', { name: 'Rejoindre la soirée' }).click();
  await pageI.waitForURL('**/etagere');
  // bannière invité + chip badge INVITÉ(E), côté invité comme côté hôte
  await expect(pageI.getByText(new RegExp(`invité de invh_${stamp}`))).toBeVisible();
  const chipI = pageI.locator('.chip', { hasText: invitee });
  await expect(chipI).toContainText('INVITÉ');

  // ── l'invité vote pour le jeu de l'hôte ──
  await pageI.getByRole('button', { name: new RegExp(`pour ${titre}`) }).click();
  await expect(pageI.getByRole('button', { name: new RegExp(`pour ${titre}`) })).toHaveAttribute('aria-pressed', 'true');

  // ── restauration silencieuse : rouvrir le lien reprend la session (jeton local) ──
  await pageI.goto(lien);
  await pageI.waitForURL('**/etagere');
  await expect(pageI.locator('.chip', { hasText: invitee })).toBeVisible();

  // ── l'hôte retire l'invité (deux temps : ✕ puis « Sûr ? ») ──
  await pageH.reload();
  const croix = pageH.getByRole('button', { name: `Retirer ${invitee}` });
  await expect(croix).toBeVisible();
  await croix.click(); // 1ᵉʳ appui : le bouton passe en confirmation
  await expect(croix).toContainText('Sûr ?');
  await croix.click(); // 2ᵉ appui : retrait effectif
  await expect(pageH.locator('.chip', { hasText: invitee })).toHaveCount(0);

  // ── la session de l'invité est morte : rechargement → écran de connexion ──
  await pageI.reload();
  await pageI.waitForURL('**/login');

  // ── et la connexion d'un invité est rejetée ──
  await pageI.getByLabel('Pseudo').fill(invitee);
  await pageI.getByLabel('Code secret').fill('1234');
  await pageI.getByRole('button', { name: 'Entrer' }).click();
  // l'invité retiré n'existe plus : message générique (rien ne fuit) —
  // le refus spécifique d'un invité EXISTANT est épinglé en unitaire (invites.test).
  await expect(pageI.getByText('Identifiants incorrects')).toBeVisible();

  await hote.close();
  await invite.close();
});
