import type { Page } from '@playwright/test';

// v2.0.0 : l'étagère d'une soirée est VIDE à la création — chaque joueur y ajoute
// depuis SA ludothèque. Ces aides reproduisent ce geste via l'API (cookies partagés
// avec le navigateur) pour préparer les parcours qui testent autre chose que l'ajout.

/** Crée un jeu dans la ludothèque du compte connecté, renvoie son id. */
export async function newGame(page: Page, title: string, boxFormat: string, extra: Record<string, string> = {}): Promise<number> {
  const form = new FormData();
  form.set('title', title);
  form.set('box_format', boxFormat);
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  const res = await page.request.post('/api/games', { form });
  if (!res.ok()) throw new Error(`ajout jeu ${title}: ${res.status()} ${await res.text()}`);
  return ((await res.json()) as { id: number }).id;
}

/** Id d'un jeu de la ludothèque courante par son titre (créé via l'UI). */
export async function gameIdByTitle(page: Page, title: string): Promise<number> {
  const { games } = (await (await page.request.get('/api/games')).json()) as { games: { id: number; title: string }[] };
  const g = games.find((x) => x.title === title);
  if (!g) throw new Error(`jeu introuvable dans la ludothèque : ${title}`);
  return g.id;
}

/** Id de la soirée active (créée via l'UI ou l'API). */
export async function nightIdOf(page: Page): Promise<number> {
  const { night } = (await (await page.request.get('/api/nights')).json()) as { night: { id: number } | null };
  if (!night) throw new Error('aucune soirée active');
  return night.id;
}

/** Pose un jeu sur l'étagère de la soirée (POST /api/nights/[id]/games). */
export async function putOnShelf(page: Page, gameId: number, nightId?: number): Promise<void> {
  const nid = nightId ?? await nightIdOf(page);
  const res = await page.request.post(`/api/nights/${nid}/games`, { data: { gameId, added: true } });
  if (!res.ok()) throw new Error(`pose sur étagère ${gameId}: ${res.status()} ${await res.text()}`);
}
