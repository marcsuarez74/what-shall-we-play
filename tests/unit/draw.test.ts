import { describe, it, expect } from 'vitest';
import { pickGameId } from '@/lib/draw';

describe('draw', () => {
  it('renvoie toujours un élément de la liste', () => {
    const ids = [10, 20, 30];
    for (let i = 0; i < 30; i++) expect(ids).toContain(pickGameId(ids));
  });
  it('refuse une liste vide', () => {
    expect(() => pickGameId([])).toThrow('sélection vide');
  });
});
