import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';

// v4.8.0 : les listes de joueurs ne proposent plus que les amis (et le foyer). Les
// parcours à plusieurs comptes rendent leurs comptes amis d'abord : deux demandes
// croisées par pseudo valent amitié (via l'API, cookies partagés avec le navigateur).
type Compte = Page | BrowserContext | APIRequestContext;
const req = (c: Compte): APIRequestContext => ('request' in c ? c.request : c);

async function pseudoDe(c: Compte): Promise<string> {
  return ((await (await req(c).get('/api/me')).json()) as { pseudo: string }).pseudo;
}

export async function devenirAmis(a: Compte, ...autres: Compte[]): Promise<void> {
  const pa = await pseudoDe(a);
  for (const b of autres) {
    const pb = await pseudoDe(b);
    const r1 = await req(a).post('/api/amis', { data: { pseudo: pb } });
    if (!r1.ok()) throw new Error(`demande d'ami ${pa} → ${pb}: ${r1.status()} ${await r1.text()}`);
    const r2 = await req(b).post('/api/amis', { data: { pseudo: pa } });
    if (!r2.ok()) throw new Error(`demande d'ami ${pb} → ${pa}: ${r2.status()} ${await r2.text()}`);
  }
}

/**
 * Rend le compte de `page` ami du compte `pseudo` (code 1234, comme tous les comptes
 * de test) sans toucher à la session du navigateur : l'autre compte se connecte dans
 * un contexte API séparé et croise la demande. Déjà amis : rien à faire.
 */
export async function devenirAmiDe(page: Page, pseudo: string): Promise<void> {
  const moi = await pseudoDe(page);
  const r1 = await page.request.post('/api/amis', { data: { pseudo } });
  if (r1.status() === 409) return;
  if (!r1.ok()) throw new Error(`demande d'ami ${moi} → ${pseudo}: ${r1.status()} ${await r1.text()}`);
  const autre = await page.context().browser()!.newContext({ baseURL: new URL(page.url()).origin });
  try {
    const login = await autre.request.post('/api/auth/login', { data: { pseudo, code: '1234' } });
    if (!login.ok()) throw new Error(`connexion ${pseudo}: ${login.status()}`);
    const r2 = await autre.request.post('/api/amis', { data: { pseudo: moi } });
    if (!r2.ok()) throw new Error(`demande d'ami ${pseudo} → ${moi}: ${r2.status()} ${await r2.text()}`);
  } finally {
    await autre.close();
  }
}
