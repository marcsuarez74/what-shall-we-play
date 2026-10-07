import { describe, expect, it } from 'vitest';
import { votantsDe } from '@/lib/votants';

const players = [
  { id: 1, pseudo: 'Marc', sticker: '🎲' },
  { id: 2, pseudo: 'Léa', sticker: '🐙' },
  { id: 3, pseudo: 'Tom', sticker: '🐻' },
];
const votes = [
  { game_id: 10, user_id: 1, pseudo: 'Marc' },
  { game_id: 10, user_id: 3, pseudo: 'Tom' },
  { game_id: 11, user_id: 2, pseudo: 'Léa' },
  { game_id: 10, user_id: 2, pseudo: 'Léa' },
];

describe('votantsDe (v4.17.0)', () => {
  it('les autres dans l’ordre du vote, moi en dernier', () => {
    expect(votantsDe(votes, 10, players, 1).map((u) => u.pseudo)).toEqual(['Tom', 'Léa', 'Marc']);
  });
  it('seulement les votes de ce jeu, avec le sticker du joueur', () => {
    expect(votantsDe(votes, 11, players, 1)).toEqual([players[1]]);
  });
  it('aucun vote → liste vide', () => {
    expect(votantsDe(votes, 99, players, 1)).toEqual([]);
  });
  it('votant absent des joueurs : gardé avec son pseudo, sans sticker', () => {
    expect(votantsDe([{ game_id: 10, user_id: 7, pseudo: 'Zoé' }], 10, players, 1))
      .toEqual([{ id: 7, pseudo: 'Zoé', sticker: null, avatar_path: null }]);
  });
});
