import { describe, it, expect } from 'vitest';
import { validateGameInput, createGame, deleteGame, listUserLibrary, getGame, enrichirJeu } from '@/lib/games';
import { registerUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

describe('games', () => {
  it('valide le format de boîte et le titre', () => {
    expect(validateGameInput({ title: 'Dune', box_format: 'énorme' }).ok).toBe(false);
    expect(validateGameInput({ title: '', box_format: 'grand' }).ok).toBe(false);
    const v = validateGameInput({ title: 'Dune', box_format: 'grand' });
    expect(v.ok && v.value.title).toBe('Dune');
  });
  it('refuse la suppression d\'un jeu déjà tiré (409)', () => {
    const uid = (registerUser('gg1', '1234') as { id: number }).id;
    const v = validateGameInput({ title: 'Rebirth', box_format: 'moyen' });
    if (!v.ok) throw new Error('input invalide');
    const gid = createGame(uid, v.value);
    const db = getDb();
    db.prepare(`INSERT INTO nights (creator_id) VALUES (?)`).run(uid);
    db.prepare(`INSERT INTO picks (night_id, game_id, spinner_id) VALUES (1, ?, ?)`).run(gid, uid);
    const res = deleteGame(uid, gid);
    expect(res).toEqual({ error: 'Ce jeu a déjà été tiré lors d\'une partie', status: 409 });
    expect(listUserLibrary(uid)).toHaveLength(1);
  });
  it('supprime un jeu jamais tiré', () => {
    const uid = (registerUser('gg2', '1234') as { id: number }).id;
    const gid = createGame(uid, { title: 'Deus', box_format: 'grand' });
    expect(deleteGame(uid, gid)).toEqual({ ok: true });
    expect(listUserLibrary(uid)).toHaveLength(0);
  });
});

describe('enrichirJeu (import BGG)', () => {
  it('complète les champs BGG et pose bgg_id, sans toucher title ni box_format', () => {
    const uid = (registerUser('eg1', '1234') as { id: number }).id;
    const gid = createGame(uid, { title: 'Ma version', box_format: 'petit', year: 2000 });
    const res = enrichirJeu(uid, gid, { bgg_id: 266192, year: 2019, publisher: 'Stonemaier Games',
      min_players: 2, max_players: 5, playtime_min: 70, weight: 2.44, bgg_rating: 8.1,
      designer: 'Elizabeth Hargrave', artist: 'Ana Manso', best_players: 3, cover_name: 'import-ws.jpg' });
    expect(res).toEqual({ ok: true });
    const g = getGame(gid)!;
    expect(g).toMatchObject({ bgg_id: 266192, year: 2019, min_players: 2, weight: 2.44, cover_path: 'import-ws.jpg' });
    expect(g.title).toBe('Ma version');           // Review Focus n°4 : titre intact
    expect(g.box_format).toBe('petit');           // Review Focus n°4 : format intact
  });
  it('une photo perso gagne toujours : COALESCE préserve cover_path existant', () => {
    const uid = (registerUser('eg2', '1234') as { id: number }).id;
    const gid = createGame(uid, { title: 'Dune', box_format: 'grand' }, 'photo-perso.jpg');
    enrichirJeu(uid, gid, { bgg_id: 18, year: null, publisher: null, min_players: null, max_players: null,
      playtime_min: null, weight: null, bgg_rating: null, designer: null, artist: null,
      best_players: null, cover_name: 'import-dune.jpg' });
    expect(getGame(gid)!.cover_path).toBe('photo-perso.jpg');
  });
  it('cover_name non sûr -> ignoré (pas de crash, pas de pochette)', () => {
    const uid = (registerUser('eg3', '1234') as { id: number }).id;
    const gid = createGame(uid, { title: 'Deus', box_format: 'grand' });
    enrichirJeu(uid, gid, { bgg_id: 156788, year: null, publisher: null, min_players: null, max_players: null,
      playtime_min: null, weight: null, bgg_rating: null, designer: null, artist: null,
      best_players: null, cover_name: '../../etc/passwd.jpg' });
    expect(getGame(gid)!.cover_path).toBeNull();
  });
  it('404 si le jeu est à un autre joueur (pas de gérance)', () => {
    const marc = (registerUser('eg4', '1234') as { id: number }).id;
    const lea = (registerUser('eg5', '1234') as { id: number }).id;
    const gid = createGame(marc, { title: 'Azul', box_format: 'moyen' });
    expect(enrichirJeu(lea, gid, { bgg_id: 1, year: null, publisher: null, min_players: null,
      max_players: null, playtime_min: null, weight: null, bgg_rating: null, designer: null,
      artist: null, best_players: null, cover_name: null })).toEqual({ error: 'Jeu introuvable', status: 404 });
  });
});
