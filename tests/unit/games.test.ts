import { describe, it, expect } from 'vitest';
import { validateGameInput, createGame, deleteGame, listUserLibrary } from '@/lib/games';
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
    expect(res).toEqual({ error: 'Ce jeu a déjà été tiré lors d\'une soirée', status: 409 });
    expect(listUserLibrary(uid)).toHaveLength(1);
  });
  it('supprime un jeu jamais tiré', () => {
    const uid = (registerUser('gg2', '1234') as { id: number }).id;
    const gid = createGame(uid, { title: 'Deus', box_format: 'grand' });
    expect(deleteGame(uid, gid)).toEqual({ ok: true });
    expect(listUserLibrary(uid)).toHaveLength(0);
  });
});
