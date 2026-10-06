import type { Page } from '@playwright/test';

// v4.8.0 : les listes de joueurs ne proposent plus que les amis (et le foyer). Les
// parcours à plusieurs comptes rendent leurs comptes amis d'abord : deux demandes
// croisées par pseudo valent amitié (via l'API, cookies partagés avec le navigateur).
async function pseudoDe(page: Page): Promise<string> {
  return ((await (await page.request.get('/api/me')).json()) as { pseudo: string }).pseudo;
}

export async function devenirAmis(a: Page, ...autres: Page[]): Promise<void> {
  const pa = await pseudoDe(a);
  for (const b of autres) {
    const pb = await pseudoDe(b);
    const r1 = await a.request.post('/api/amis', { data: { pseudo: pb } });
    if (!r1.ok()) throw new Error(`demande d'ami ${pa} → ${pb}: ${r1.status()} ${await r1.text()}`);
    const r2 = await b.request.post('/api/amis', { data: { pseudo: pa } });
    if (!r2.ok()) throw new Error(`demande d'ami ${pb} → ${pa}: ${r2.status()} ${await r2.text()}`);
  }
}
