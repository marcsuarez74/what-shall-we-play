import { describe, it, expect } from 'vitest';
import { registerUser } from '@/lib/auth';
import { createNight, getShelfGames, getCurrentNight, userCanAccessNight, setNightPlayers } from '@/lib/nights';
import { createGame } from '@/lib/games';

describe('nights', () => {
  it('crée une soirée, inclut le créateur, combine les bibliothèques', () => {
    const marc = (registerUser('n-marc', '1234') as { id: number }).id;
    const lea = (registerUser('n-lea', '1234') as { id: number }).id;
    createGame(marc, { title: 'Terraforming Mars', box_format: 'grand' });
    createGame(lea, { title: 'Harmonies', box_format: 'petit' });
    const nightId = createNight(marc, [marc, lea]);
    const games = getShelfGames(nightId);
    expect(games.map((g) => g.title).sort()).toEqual(['Harmonies', 'Terraforming Mars']);
    expect(getCurrentNight(marc)?.id).toBe(nightId);
    expect(userCanAccessNight(lea, nightId)).toBe(true);
    expect(userCanAccessNight((registerUser('n-autre', '1234') as { id: number }).id, nightId)).toBe(false);
  });
  it('modifie les joueurs présents', () => {
    const a = (registerUser('n-a', '1234') as { id: number }).id;
    const b = (registerUser('n-b', '1234') as { id: number }).id;
    const c = (registerUser('n-c', '1234') as { id: number }).id;
    const nightId = createNight(a, [a, b]);
    setNightPlayers(nightId, [a, c]);
    expect(getShelfGames(nightId)).toHaveLength(0); // b parti, c et a n'ont rien
  });
});
