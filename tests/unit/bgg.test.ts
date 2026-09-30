import { describe, it, expect, vi } from 'vitest';
import { parseThingXml, getThing, attachCover } from '@/lib/bgg';
import { isSafeCoverName } from '@/lib/storage';
import { THING_XML } from './bgg.fixture';

describe('bgg', () => {
  it('parse la fiche d\'un jeu', () => {
    const p = parseThingXml(THING_XML);
    expect(p).toMatchObject({
      bggId: 167791, title: 'Terraforming Mars', year: 2016, publisher: 'FryxGames',
      minPlayers: 1, maxPlayers: 5, playtimeMin: 120, weight: 3.32, rating: 8.36,
      imageUrl: 'https://cf.geekdo-images.com/f.jpg',
    });
  });
  it('renvoie null sur un XML vide', () => {
    expect(parseThingXml('<items total="0"></items>')).toBeNull();
  });
  it('met en cache 30 jours (2e appel sans réseau)', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(THING_XML, { status: 200 }));
    await getThing(167791);
    await getThing(167791);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
  it('timeout BGG -> null (et pas de crash)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    expect(await getThing(999999)).toBeNull();
  });
  // Hors brief : la pochette est rapatriée par attachCover (appelé par la route /api/bgg/thing),
  // car le mock du test cache couvre TOUTES les URL et exige exactement 1 appel fetch.
  it('rapatrie la pochette (saveCover jpg) et la persiste au cache', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(THING_XML, { status: 200 }))
      .mockResolvedValue(new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), { status: 200, headers: { 'content-type': 'image/jpeg' } }));
    const thing = await getThing(174430);
    expect(thing?.coverName).toBeNull();
    const withCover = await attachCover(thing!);
    expect(withCover.coverName).toMatch(/\.jpg$/);
    expect(isSafeCoverName(withCover.coverName!)).toBe(true);
  });
  it('ne retélécharge pas la pochette déjà persistée au cache', async () => {
    global.fetch = vi.fn();
    const cached = await getThing(174430);
    expect(cached?.coverName).toMatch(/\.jpg$/);
    expect(await attachCover(cached!)).toBe(cached!);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
