import { test, expect, type Page } from '@playwright/test';

// v4.18.0 : l'inscription enchaîne sur l'étape ② « Tes jeux » (/bienvenue) — recherche
// BGG, import de collection ou saisie à la main — puis Ma ludothèque, avec une alerte
// affichée une seule fois. Les appels BGG sont simulés (pas de token en CI).
const stamp = Date.now().toString(36);

const THING = {
  bggId: 503, title: 'Through the Desert', year: 1993, publisher: 'Z-Man Games',
  minPlayers: 2, maxPlayers: 5, playtimeMin: 45, weight: 2.16, rating: 7.2,
  imageUrl: null, designer: 'Reiner Knizia', artist: 'John Gravato', bestPlayers: 3,
  coverName: null,
};

async function inscrire(page: Page, pseudo: string, url = '/register') {
  await page.goto(url);
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await page.waitForURL('**/bienvenue**');
  await expect(page.getByRole('heading', { name: new RegExp(pseudo) })).toBeVisible();
}

test('onboarding : saisie à la main, format modifiable, puis Ma ludothèque avec alerte unique', async ({ page }) => {
  await inscrire(page, `onb_m_${stamp}`);
  await page.getByRole('button', { name: '✍️ À la main' }).click();
  await page.getByLabel('Titre du jeu').fill('Le jeu de mamie');
  await page.getByRole('button', { name: 'Ajouter ce jeu' }).click();
  await expect(page.getByRole('status').filter({ hasText: '✓ Le jeu de mamie ajouté' })).toBeVisible();

  // Puce de format : Grand par défaut, un tap passe au format suivant (cycle)
  const puce = page.getByRole('button', { name: /^Format de Le jeu de mamie/ });
  await expect(puce).toHaveText('Grand');
  await puce.click();
  await expect(puce).toHaveText('Mini');

  await page.getByRole('button', { name: 'Terminer · 1 jeu' }).click();
  await page.waitForURL('**/library');           // ?bienvenue=1 retiré de l'URL
  await expect(page.getByText('🎉 Ta ludothèque est prête.')).toBeVisible();
  await expect(page.getByText('Le jeu de mamie')).toBeVisible();
  await page.reload();
  await expect(page.getByText('🎉 Ta ludothèque est prête.')).toHaveCount(0); // une seule fois
});

test('onboarding : recherche BGG — un tap ajoute, ✕ retire', async ({ page }) => {
  await page.route('**/api/bgg/search*', (r) =>
    r.fulfill({ json: { results: [{ bggId: 503, name: 'Through the Desert', annee: 1993 }] } }));
  await page.route('**/api/bgg/thing*', (r) => r.fulfill({ json: THING }));
  await inscrire(page, `onb_r_${stamp}`);

  await page.getByLabel('Rechercher un jeu').fill('Through');
  await page.getByRole('button', { name: /Through the Desert.*\+ Ajouter/ }).click();
  await expect(page.getByRole('button', { name: /Through the Desert.*✓ Ajouté/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Terminer · 1 jeu' })).toBeVisible();

  await page.getByRole('button', { name: 'Retirer Through the Desert' }).click();
  await expect(page.getByRole('button', { name: /Through the Desert.*\+ Ajouter/ })).toBeEnabled();
  await page.getByRole('button', { name: 'Passer pour l’instant' }).click();
  await page.waitForURL('**/library');
  await expect(page.getByText('🎉 Bienvenue !')).toBeVisible();
});

test('onboarding : inscription depuis un lien (?next=) — passer ramène au lien', async ({ page }) => {
  await inscrire(page, `onb_n_${stamp}`, `/register?next=${encodeURIComponent('/faq')}`);
  await page.getByRole('button', { name: 'Passer pour l’instant' }).click();
  await page.waitForURL('**/faq');
});
