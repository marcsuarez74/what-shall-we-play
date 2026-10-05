import { test, expect } from '@playwright/test';

// Épingles SEO/PWA : aperçus de partage (og:) et icônes du manifest.
// L'og:image doit être ABSOLUE (les scrapers WhatsApp/Slack n'aiment pas le relatif)
// mais sans épingler le domaine (il a déjà déménagé une fois — cf. v4.2.2).
test('og:image absolue vers l\'icône 512 + og:title', async ({ page }) => {
  await page.goto('/');
  const og = page.locator('meta[property="og:image"]');
  await expect(og).toHaveCount(1);
  const url = await og.getAttribute('content');
  expect(url).toMatch(/^https:\/\/[^/]+\/icons\/icon-512\.png$/);
  await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
});

test('manifest : icônes « any » + « maskable » déclarées', async ({ request }) => {
  const m = await (await request.get('/manifest.webmanifest')).json();
  const purposes = (m.icons as Array<{ purpose?: string }>).map((i) => i.purpose ?? '');
  expect(purposes).toContain('any');
  expect(purposes).toContain('maskable');
});
