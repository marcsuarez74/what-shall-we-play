import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseThingXml, getThing, attachCover, collectionUtilisateur, parseCollectionXml, searchBoardgames } from '@/lib/bgg';
import { isSafeCoverName } from '@/lib/storage';
import { THING_XML, COLLECTION_XML, COLLECTION_ERRORS_XML, SEARCH_XML } from './bgg.fixture';

describe('bgg', () => {
  it('parse la fiche d\'un jeu', () => {
    const p = parseThingXml(THING_XML);
    expect(p).toMatchObject({
      bggId: 167791, title: 'Terraforming Mars', year: 2016, publisher: 'FryxGames',
      minPlayers: 1, maxPlayers: 5, playtimeMin: 120, weight: 3.32, rating: 8.36,
      imageUrl: 'https://cf.geekdo-images.com/f.jpg',
      designer: 'Jacob Fryxelius', artist: 'Isaac Fryxelius, Daniel Fryxelius',
      bestPlayers: 3, // le plus de votes « Best » (61), pas le groupe au plus grand nombre de joueurs
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
  // Épingle R1 : deux appels concurrents partent à ≥ 1000 ms d'écart (pas au même instant).
  it('sérialise les appels BGG concurrents (~1 req/s)', async () => {
    const fired: number[] = [];
    global.fetch = vi.fn(async () => { fired.push(Date.now()); return new Response(THING_XML, { status: 200 }); });
    await Promise.all([getThing(111), getThing(222)]);
    expect(fired).toHaveLength(2);
    expect(fired[1]! - fired[0]!).toBeGreaterThanOrEqual(950);
  });
});

describe('collection BGG (import)', () => {
  it('parse les items possédés (name, année, thumbnail @value ou @src)', () => {
    expect(parseCollectionXml(COLLECTION_XML)).toEqual([
      { bggId: 174430, titre: 'Gloomhaven', annee: 2017, thumb: 'https://cf.geekdo-images.com/t-gh.jpg' },
      { bggId: 266192, titre: 'Wingspan', annee: 2019, thumb: 'https://cf.geekdo-images.com/t-ws.jpg' },
    ]);
  });
  it('XML vide ou sans items -> []', () => {
    expect(parseCollectionXml('<items total="0"></items>')).toEqual([]);
    expect(parseCollectionXml('')).toEqual([]);
  });
  it('recherche : bggId, nom et année (forme réelle /search, année en @value)', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(SEARCH_XML, { status: 200 }));
    expect(await searchBoardgames('wingspan')).toEqual([
      { bggId: 266192, name: 'Wingspan', annee: 2019 },
      { bggId: 366161, name: 'Wingspan Asia', annee: 2022 },
      { bggId: 473508, name: 'Wingspan Pocket', annee: null }, // sans année publiée
    ]);
  });
  it('recherche : ne garde que les jeux dont le nom CONTIENT la requête', async () => {
    // /search BGG fait du flou (préfixes, mots voisins) — l'autocomplete promet « contient ».
    global.fetch = vi.fn().mockResolvedValue(new Response(`<?xml version="1.0" encoding="utf-8"?>
<items total="2" termsofuse="https://boardgamegeek.com/xmlapi/termsofuse">
  <item type="boardgame" id="266192"><name type="primary" value="Wingspan"/><yearpublished value="2019"/></item>
  <item type="boardgame" id="1234"><name type="primary" value="Hatch"/><yearpublished value="2021"/></item>
</items>`, { status: 200 }));
    expect(await searchBoardgames('wingspan')).toEqual([
      { bggId: 266192, name: 'Wingspan', annee: 2019 },
    ]);
  });
  it('recherche : contient insensible aux accents (« etang » trouve « Étang »)', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(`<?xml version="1.0" encoding="utf-8"?>
<items total="1" termsofuse="https://boardgamegeek.com/xmlapi/termsofuse">
  <item type="boardgame" id="99"><name type="primary" value="Étang des oasis"/><yearpublished value="2018"/></item>
</items>`, { status: 200 }));
    expect(await searchBoardgames('etang')).toEqual([{ bggId: 99, name: 'Étang des oasis', annee: 2018 }]);
  });
  it('recherche : décode les entités numériques (&#039; → \')', async () => {
    // Épinglé en prod : « The King&#039;s Dilemma » stocké tel quel par le parseur.
    global.fetch = vi.fn().mockResolvedValue(new Response(`<?xml version="1.0" encoding="utf-8"?>
<items total="1" termsofuse="https://boardgamegeek.com/xmlapi/termsofuse">
  <item type="boardgame" id="244529"><name type="primary" value="The King&#039;s Dilemma"/><yearpublished value="2019"/></item>
</items>`, { status: 200 }));
    expect(await searchBoardgames("king's")).toEqual([{ bggId: 244529, name: "The King's Dilemma", annee: 2019 }]);
  });
  it('épingles Review Focus n°2 : <errors> BGG -> 404 (pas une collection vide)', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(COLLECTION_ERRORS_XML, { status: 200 }));
    expect(await collectionUtilisateur('introuvable')).toEqual({
      error: 'Collection BGG introuvable ou privée', status: 404 });
  });
  it('pseudo vide ou trop long -> 400, sans appel réseau', async () => {
    global.fetch = vi.fn();
    expect(await collectionUtilisateur('  ')).toEqual({ error: 'Pseudo BGG invalide', status: 400 });
    expect(await collectionUtilisateur('x'.repeat(61))).toEqual({ error: 'Pseudo BGG invalide', status: 400 });
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it('202 puis 200 -> réessai et succès (Retry-After respecté, plafonné à 5 s)', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 202, headers: { 'Retry-After': '1' } }))
      .mockResolvedValueOnce(new Response(COLLECTION_XML, { status: 200 }));
    const r = await collectionUtilisateur('quelquun');
    expect(r).toMatchObject({ ok: true });
    expect((r as { jeux: unknown[] }).jeux).toHaveLength(2);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
  it('épingles Review Focus n°1 : 202 en boucle -> 503 dès le budget dépassé', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('', { status: 202, headers: { 'Retry-After': '1' } }));
    const r = await collectionUtilisateur('quelquun', 1500);
    expect(r).toEqual({ error: 'BGG prépare ta collection — réessaie dans un instant', status: 503 });
  });
  it('HTTP 404/500 ou réseau -> 502', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('', { status: 500 }));
    expect(await collectionUtilisateur('quelquun')).toEqual({ error: 'BGG ne répond pas', status: 502 });
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    expect(await collectionUtilisateur('quelquun')).toEqual({ error: 'BGG ne répond pas', status: 502 });
  });
  it('coupure pendant la lecture du corps -> 502 (contrat réseau)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, headers: new Headers(),
      text: () => Promise.reject(new Error('body cut')),
    });
    expect(await collectionUtilisateur('quelquun')).toEqual({ error: 'BGG ne répond pas', status: 502 });
  });
});

describe('auth API BGG (cookie de session en attendant le token)', () => {
  // verrouillage BGG (401 + WWW-Authenticate: Bearer) : sans auth, tout l'XMLAPI2 répond 401.
  const envAvant = { ...process.env };
  afterEach(() => { process.env = { ...envAvant }; });

  it('les appels XMLAPI2 partent vers boardgamegeek.com (BASE partagé : collection, things, search)', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(COLLECTION_XML, { status: 200 }));
    await collectionUtilisateur('quelquun');
    expect(String(vi.mocked(global.fetch).mock.calls[0]?.[0])).toMatch(/^https:\/\/boardgamegeek\.com\/xmlapi2\//);
  });

  it('BGG_COOKIE défini sans token -> en-tête Cookie envoyé, pas d\'Authorization', async () => {
    process.env.BGG_COOKIE = 'bggusername=marc; bggpassword=xyz';
    global.fetch = vi.fn().mockResolvedValue(new Response(COLLECTION_XML, { status: 200 }));
    await collectionUtilisateur('quelquun');
    const h = (vi.mocked(global.fetch).mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(h['Cookie']).toBe('bggusername=marc; bggpassword=xyz');
    expect(h['Authorization']).toBeUndefined();
  });

  // Garde : le contrat existant (token prioritaire) doit survivre au fallback cookie.
  it('BGG_TOKEN défini -> Authorization Bearer prioritaire, pas de Cookie', async () => {
    process.env.BGG_TOKEN = 'jeton';
    process.env.BGG_COOKIE = 'bggusername=marc';
    global.fetch = vi.fn().mockResolvedValue(new Response(COLLECTION_XML, { status: 200 }));
    await collectionUtilisateur('quelquun');
    const h = (vi.mocked(global.fetch).mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(h['Authorization']).toBe('Bearer jeton');
    expect(h['Cookie']).toBeUndefined();
  });
});
