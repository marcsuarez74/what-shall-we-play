import { randomInt } from 'node:crypto';

export function pickGameId(gameIds: number[]): number {
  if (gameIds.length === 0) throw new Error('sélection vide');
  return gameIds[randomInt(gameIds.length)];
}

// Tirage pondéré : cumul des poids, la roulette tombe dans le segment du jeu.
export function pickWeightedGameId(
  entries: { id: number; poids: number }[],
  rnd: () => number = Math.random
): number {
  if (entries.length === 0) throw new Error('sélection vide');
  const total = entries.reduce((s, e) => s + Math.max(0, e.poids), 0);
  if (total <= 0) return entries[0].id;
  let ticket = rnd() * total;
  for (const e of entries) {
    ticket -= Math.max(0, e.poids);
    if (ticket < 0) return e.id;
  }
  return entries[entries.length - 1].id;
}
