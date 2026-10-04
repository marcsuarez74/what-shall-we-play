import { describe, it, expect } from 'vitest';
import { pickGameId, pickWeightedGameId } from '@/lib/draw';

describe('draw', () => {
  it('renvoie toujours un élément de la liste', () => {
    const ids = [10, 20, 30];
    for (let i = 0; i < 30; i++) expect(ids).toContain(pickGameId(ids));
  });
  it('refuse une liste vide', () => {
    expect(() => pickGameId([])).toThrow('sélection vide');
  });
});

// Roulette pondérée : cumul des poids, rnd ∈ [0,1[ tombe dans le segment du jeu.
describe('pickWeightedGameId', () => {
  it('rnd=0 → premier poids plein ; rnd proche de 1 → dernier', () => {
    const e = [{ id: 1, poids: 1 }, { id: 2, poids: 3 }];
    expect(pickWeightedGameId(e, () => 0)).toBe(1);
    expect(pickWeightedGameId(e, () => 0.999)).toBe(2);
  });
  it('poids 0 → jamais choisi', () => {
    expect(pickWeightedGameId([{ id: 1, poids: 0 }, { id: 2, poids: 1 }], () => 0)).toBe(2);
  });
  it('liste vide → throw', () => {
    expect(() => pickWeightedGameId([], () => 0)).toThrow();
  });
});
