import { test, expect } from '@playwright/test';

// Chrome global : la pastille utilisateur (menu en haut à droite) doit rester
// intacte sur toutes les pages, même avec le titre de page le plus long en
// viewport mobile (bug v3.6.0 : « Importer une collection » compressait le chip
// dans .page-head -> icône, initiale et carret empilés sur deux lignes).
test('chip utilisateur : une seule ligne, même avec le titre de page le plus long', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(`chip_${Date.now().toString(36)}`);
  await page.getByLabel('Code secret').fill('1234');
  const done = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await done;

  await page.goto('/games/import'); // « Importer une collection » : le titre le plus long de l'app
  const summary = page.locator('summary[aria-label="Menu utilisateur"]');

  // Une seule ligne : ~40 px de haut ; le contenu replié donne ~62 px.
  const box = await summary.boundingBox();
  expect(box!.height).toBeLessThan(50);

  // Aucun texte superposé : chaque fragment de texte a sa propre abscisse.
  const xs = await summary.evaluate((el) => {
    const parts: number[] = [];
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walk.nextNode())) {
      if (!n.textContent!.trim()) continue;
      const rg = document.createRange();
      rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) parts.push(Math.round(r.x));
    }
    return parts;
  });
  expect(xs.length).toBeGreaterThan(1);
  expect(new Set(xs).size).toBe(xs.length);
});
