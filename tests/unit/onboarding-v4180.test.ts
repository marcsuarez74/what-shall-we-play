import { describe, it, expect } from 'vitest';
import { ficheBggFormData, type FicheBgg } from '@/lib/bgg-ajout';

const fiche: FicheBgg = {
  bggId: 13, title: 'Catan', year: 1995, publisher: 'Kosmos', minPlayers: 3, maxPlayers: 4,
  playtimeMin: 90, weight: 2.3, rating: 7.1, designer: 'Klaus Teuber', artist: null,
  bestPlayers: 4, coverName: 'bgg-13.jpg',
};

describe('ficheBggFormData', () => {
  it('reprend la fiche BGG et le format choisi', () => {
    const fd = ficheBggFormData(fiche, 'moyen');
    expect(fd.get('title')).toBe('Catan');
    expect(fd.get('box_format')).toBe('moyen');
    expect(fd.get('bgg_id')).toBe('13');
    expect(fd.get('min_players')).toBe('3');
    expect(fd.get('bgg_rating')).toBe('7.1');
    expect(fd.get('cover_name')).toBe('bgg-13.jpg');
  });
  it('omet les champs vides et accepte un titre corrigé', () => {
    const fd = ficheBggFormData({ ...fiche, artist: null, coverName: null }, 'grand', '  Les Colons  ');
    expect(fd.get('title')).toBe('Les Colons');
    expect(fd.has('artist')).toBe(false);
    expect(fd.has('cover_name')).toBe(false);
  });
});
