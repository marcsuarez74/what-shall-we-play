import { randomInt } from 'node:crypto';

export function pickGameId(gameIds: number[]): number {
  if (gameIds.length === 0) throw new Error('sélection vide');
  return gameIds[randomInt(gameIds.length)];
}
