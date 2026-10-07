import { describe, it, expect } from 'vitest';
import { filterShelf, filtresActifs } from '@/lib/filters';
import type { Game } from '@/lib/types';

const g = (o: Partial<Game>): Game => ({
  id: 1, owner_id: 1, bgg_id: null, title: 'X', year: null, publisher: null,
  cover_url: null, cover_path: null, min_players: 1, max_players: 5, playtime_min: 45,
  weight: 2.5, bgg_rating: null, box_format: 'moyen', created_at: '',
  designer: null, artist: null, best_players: null, ...o,
});
const base = [
  g({ id: 1, title: 'Azul', min_players: 2, max_players: 4, weight: 1.7, playtime_min: 35 }),
  g({ id: 2, title: 'Terraforming Mars', min_players: 1, max_players: 5, weight: 3.2, playtime_min: 120 }),
  g({ id: 3, title: 'Jaipur', min_players: 2, max_players: 2, weight: 1.6, playtime_min: 30, box_format: 'petit' }),
  g({ id: 4, title: 'Mystérum', min_players: null, max_players: null, weight: null, playtime_min: null }),
];
const all = { q: '', players: null, weight: 'all', duration: 'all', format: 'all' } as const;

describe('filtres de l étagère', () => {
  it('sans filtre : tout passe', () => {
    expect(filterShelf(base, all).map((x) => x.id)).toEqual([1, 2, 3, 4]);
  });

  it('recherche insensible à la casse ET aux accents', () => {
    expect(filterShelf(base, { ...all, q: 'azu' }).map((x) => x.id)).toEqual([1]);
    expect(filterShelf(base, { ...all, q: 'MYSTERUM' }).map((x) => x.id)).toEqual([4]);
    expect(filterShelf(base, { ...all, q: 'mysterum' }).map((x) => x.id)).toEqual([4]);
  });

  it('filtre joueurs : min/max encadrent le nombre de présents ; sans bornes : toujours visible', () => {
    expect(filterShelf(base, { ...all, players: 2 }).map((x) => x.id)).toEqual([1, 2, 3, 4]);
    expect(filterShelf(base, { ...all, players: 5 }).map((x) => x.id)).toEqual([2, 4]);
    expect(filterShelf(base, { ...all, players: 6 }).map((x) => x.id)).toEqual([4]);
  });

  it('complexité : légère < 2, moyenne [2,3[, lourde ≥ 3 ; sans poids : toujours visible', () => {
    expect(filterShelf(base, { ...all, weight: 'leger' }).map((x) => x.id)).toEqual([1, 3, 4]);
    expect(filterShelf(base, { ...all, weight: 'moyen' }).map((x) => x.id)).toEqual([4]);
    expect(filterShelf(base, { ...all, weight: 'lourd' }).map((x) => x.id)).toEqual([2, 4]);
  });

  it('durée (v4.12) : court < 30, moyen [30,60], long ]60,90], tres > 90 ; sans durée : toujours visible', () => {
    const avec75 = [...base, g({ id: 5, title: 'Wingspan', playtime_min: 75 }), g({ id: 6, title: 'Bornes', playtime_min: 90 })];
    expect(filterShelf(avec75, { ...all, duration: 'court' }).map((x) => x.id)).toEqual([4]);
    expect(filterShelf(avec75, { ...all, duration: 'moyen' }).map((x) => x.id)).toEqual([1, 3, 4]);
    expect(filterShelf(avec75, { ...all, duration: 'long' }).map((x) => x.id)).toEqual([4, 5, 6]);
    expect(filterShelf(avec75, { ...all, duration: 'tres' }).map((x) => x.id)).toEqual([2, 4]);
  });

  it('filtresActifs : compte les familles actives, jamais la recherche', () => {
    expect(filtresActifs(all)).toBe(0);
    expect(filtresActifs({ ...all, q: 'azul' })).toBe(0);
    expect(filtresActifs({ ...all, players: 4, weight: 'leger' })).toBe(2);
    expect(filtresActifs({ ...all, players: 4, weight: 'lourd', duration: 'tres', format: 'grand' })).toBe(4);
  });

  it('filtres combinés', () => {
    expect(filterShelf(base, { q: '', players: 2, weight: 'leger', duration: 'moyen', format: 'all' }).map((x) => x.id)).toEqual([1, 3, 4]);
    expect(filterShelf(base, { q: 'mars', players: 2, weight: 'lourd', duration: 'tres', format: 'all' }).map((x) => x.id)).toEqual([2]);
  });

  it('format de boîte (ludothèque) : filtre exact, all = tout', () => {
    expect(filterShelf(base, { ...all, format: 'petit' }).map((x) => x.id)).toEqual([3]);
    expect(filterShelf(base, { ...all, format: 'mini' }).map((x) => x.id)).toEqual([]);
    expect(filterShelf(base, { ...all, format: 'all' }).map((x) => x.id)).toEqual([1, 2, 3, 4]);
  });
});
