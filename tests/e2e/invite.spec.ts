import { test, expect, type Page } from '@playwright/test';
import { newGame } from './helpers/shelf';

// Parcours invité v4.7.0 (maquette mockup/2026-10-06-v470-invites-refonte.html) :
// l'hôte programme une partie titrée, prépare l'étagère à l'avance et partage le lien ;
// l'invité ne voit QUE sa soirée (pas d'onglets, pas de profil), vote, se retire
// ou convertit son invitation en compte ; l'hôte distingue ses invités et peut
// supprimer la partie programmée (confirmation listant les pertes).

const demain = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('sv-SE');
};

async function inscrire(page: Page, pseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await page.waitForURL('**/etagere');
}

async function rejoindre(page: Page, lien: string, nom: string) {
  await page.goto(lien);
  await page.getByLabel('Ton prénom (ou ton surnom de table)').fill(nom);
  await page.getByRole('button', { name: 'Rejoindre la soirée' }).click();
  await page.waitForURL('**/invite');
}

test('invité v4.7.0 : partie programmée → lien → vue restreinte → vote → retrait / compte → suppression', async ({ browser }) => {
  test.setTimeout(120_000); // trois navigateurs, un parcours complet
  const stamp = Date.now().toString(36);
  const hotePseudo = `h47_${stamp}`;
  const titreJeu = `Azul${stamp}`;
  const titrePartie = `Soirée ${stamp}`;

  // ── l'hôte programme une partie titrée pour demain ──
  const hote = await browser.newContext();
  const pageH = await hote.newPage();
  await inscrire(pageH, hotePseudo);
  await newGame(pageH, titreJeu, 'moyen');
  await pageH.goto('/nights');
  await pageH.getByRole('button', { name: 'Programmer une partie' }).click();
  await pageH.getByLabel('Titre').fill(titrePartie);
  await pageH.getByLabel('Date').fill(demain());
  await pageH.getByLabel('Heure').fill('20:30');
  await pageH.getByRole('button', { name: 'Programmer', exact: true }).click();
  const carte = pageH.locator('.planned-card', { hasText: titrePartie });
  await expect(carte).toBeVisible();

  // ── il prépare l'étagère à l'avance : ajout de jeu oui, tirage non ──
  await carte.getByRole('link', { name: 'Préparer l’étagère' }).click();
  await pageH.waitForURL(/\/etagere\?night=\d+/);
  await expect(pageH.getByText('Programmée')).toBeVisible();
  await expect(pageH.locator('.nc-titre')).toHaveText(titrePartie);
  await pageH.getByRole('button', { name: 'Ajouter des jeux depuis ma ludothèque' }).click();
  const sheet = pageH.locator('.picker-sheet');
  await sheet.getByRole('button', { name: new RegExp(`Ajouter ${titreJeu}`) }).click();
  await sheet.getByRole('button', { name: 'Terminé' }).click();
  await expect(pageH.locator('.box').first()).toBeVisible();
  await expect(pageH.getByText('Le tirage s’ouvre le jour de la partie', { exact: false })).toBeVisible();
  await expect(pageH.getByRole('button', { name: /Lancer/ })).toHaveCount(0);
  const lien = new URL((await pageH.locator('.lien-url').textContent())!.trim()).pathname
    + new URL((await pageH.locator('.lien-url').textContent())!.trim()).search;

  // ── l'invité ouvre le lien sans compte : l'invitation d'abord ──
  const invite = await browser.newContext();
  const pageI = await invite.newPage();
  await pageI.goto(lien);
  await expect(pageI.getByText(`${hotePseudo} t’invite`)).toBeVisible();
  await expect(pageI.getByRole('heading', { name: titrePartie })).toBeVisible();
  const nomI = `Léa ${stamp}`;
  await rejoindre(pageI, lien, nomI);

  // ── sa soirée, et rien d'autre : pas d'onglets, pas de menu profil ──
  await expect(pageI.getByRole('heading', { name: titrePartie })).toBeVisible();
  await expect(pageI.getByText(`Organisée par ${hotePseudo}`)).toBeVisible();
  await expect(pageI.getByRole('navigation', { name: 'Navigation principale' })).toHaveCount(0);
  await expect(pageI.getByLabel('Menu utilisateur')).toHaveCount(0);
  const vote = pageI.getByRole('button', { name: new RegExp(`pour ${titreJeu}`) });
  await vote.click();
  await expect(vote).toHaveAttribute('aria-pressed', 'true');
  // la fiche du jeu s'ouvre en lecture seule (pas de « retirer de la partie »)
  await pageI.locator('.box').first().click();
  const fiche = pageI.getByRole('dialog', { name: titreJeu });
  await expect(fiche).toBeVisible();
  await expect(fiche.locator('.btn-exclude')).toHaveCount(0);
  await fiche.getByRole('button', { name: 'Fermer' }).click();
  await expect(fiche).toHaveCount(0);
  await pageI.goto('/library'); // toute autre page le ramène à sa soirée
  await pageI.waitForURL('**/invite');

  // ── côté hôte : l'invitée apparaît à part, badge INVITÉ ──
  await pageH.reload();
  await expect(pageH.getByText('Invités · 1')).toBeVisible();
  await expect(pageH.locator('.chip.invite', { hasText: nomI })).toContainText('INVITÉ');

  // ── un invité n'est jamais proposé dans une nouvelle partie ──
  await pageH.goto('/nights');
  await pageH.getByRole('button', { name: 'Programmer une partie' }).click();
  await expect(pageH.locator('.player-list')).not.toContainText(nomI);
  await pageH.getByRole('button', { name: 'Annuler' }).click();

  // ── un second invité se retire lui-même (deux temps) ──
  const invite2 = await browser.newContext();
  const pageI2 = await invite2.newPage();
  const nomI2 = `Karim ${stamp}`;
  await rejoindre(pageI2, lien, nomI2);
  await pageI2.getByRole('button', { name: 'Se retirer de la soirée' }).click();
  await pageI2.getByRole('button', { name: 'Confirmer : je me retire' }).click();
  await expect(pageI2.getByText(`Tu ne fais plus partie de la soirée de ${hotePseudo}.`)).toBeVisible();
  await pageI2.goto('/invite');
  await pageI2.waitForURL('**/login'); // session morte avec la ligne invitée

  // ── la première invitée crée son compte : même identité, vote conservé ──
  await pageI.getByRole('button', { name: 'Créer mon compte' }).click();
  const pseudoCompte = `lea_${stamp}`;
  await pageI.getByLabel('Pseudo').fill(pseudoCompte);
  await pageI.getByLabel('Code secret').fill('4321');
  await pageI.getByRole('button', { name: 'Créer mon compte' }).click();
  await pageI.waitForURL(/\/etagere\?night=\d+/);
  await expect(pageI.getByRole('button', { name: new RegExp(`pour ${titreJeu}`) })).toHaveAttribute('aria-pressed', 'true');
  await expect(pageI.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible();

  // ── l'hôte supprime la partie programmée : confirmation qui liste les pertes ──
  await pageH.goto('/nights');
  const carte2 = pageH.locator('.planned-card', { hasText: titrePartie });
  await carte2.getByRole('button', { name: /Supprimer la partie du/ }).click();
  await expect(carte2.getByText(`Elle disparaît des parties de ${pseudoCompte}.`)).toBeVisible();
  await expect(carte2.getByText('1 jeu retiré de l’étagère', { exact: false })).toBeVisible();
  await carte2.getByRole('button', { name: 'Supprimer la partie', exact: true }).click();
  await expect(pageH.locator('.planned-card', { hasText: titrePartie })).toHaveCount(0);

  // ── le lien ne marche plus ──
  await pageI2.goto(lien);
  await expect(pageI2.getByText('Cette soirée a été annulée', { exact: false })).toBeVisible();

  await hote.close();
  await invite.close();
  await invite2.close();
});
