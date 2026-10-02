import { describe, it, expect } from 'vitest';
import { rankScores, medaille } from '@/lib/ranks';

describe('rankScores', () => {
  it('trie descendant et numérote', () => {
    const r = rankScores([{ id: 1, score: 10 }, { id: 2, score: 30 }, { id: 3, score: 20 }]);
    expect(r.map((x) => x.id)).toEqual([2, 3, 1]);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 3]);
  });
  it('égalité : même rang, rang dense (1,1,2 — jamais 1,1,3)', () => {
    const r = rankScores([{ id: 1, score: 19 }, { id: 2, score: 24 }, { id: 3, score: 19 }]);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 2]);
  });
  it('exclut les scores absents ou non finis', () => {
    const r = rankScores([{ id: 1, score: null }, { id: 2, score: Number.NaN }, { id: 3, score: 5 }]);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe(3);
  });
  it('vide → vide ; medaille au-delà de 3 → chaîne vide', () => {
    expect(rankScores([])).toEqual([]);
    expect(medaille(0)).toBe('');
    expect(medaille(4)).toBe('');
  });
});
