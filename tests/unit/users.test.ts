import { describe, it, expect } from 'vitest';
import { registerUser } from '@/lib/auth';
import { createNight } from '@/lib/nights';
import { createGame } from '@/lib/games';
import { getDb } from '@/lib/db';
import { getProfileStats, setSticker, ALLOWED_STICKERS } from '@/lib/users';

const uid = (p: string) => (registerUser(p, '1234') as { id: number }).id;
const pick = (nightId: number, gameId: number, spinnerId: number) =>
  getDb().prepare('INSERT INTO picks (night_id, game_id, spinner_id) VALUES (?, ?, ?)').run(nightId, gameId, spinnerId);

describe('profil', () => {
  it('stats : plays / nights / games', () => {
    const marc = uid('p-marc');
    const lea = uid('p-lea');
    const g1 = createGame(marc, { title: 'Dune', box_format: 'grand' });
    const g2 = createGame(marc, { title: 'Meadow', box_format: 'moyen' });
    const n1 = createNight(marc, [marc, lea]);
    createNight(lea, [lea]);
    pick(n1, g1, marc);
    pick(n1, g2, marc);
    expect(getProfileStats(marc)).toEqual({ plays: 2, nights: 1, games: 2 });
    expect(getProfileStats(lea)).toEqual({ plays: 0, nights: 2, games: 0 });
  });

  it('setSticker accepte un emoji de la liste et rejette le reste', () => {
    const marc = uid('p-stick');
    expect(setSticker(marc, '🦊')).toEqual({ ok: true });
    expect((getDb().prepare('SELECT sticker FROM users WHERE id = ?').get(marc) as { sticker: string }).sticker).toBe('🦊');
    expect(setSticker(marc, '<script>')).toEqual({ error: 'Sticker inconnu', status: 400 });
    expect(setSticker(marc, 42)).toEqual({ error: 'Sticker inconnu', status: 400 });
  });

  it('la liste de stickers contient 32 emojis dont le dé', () => {
    expect(ALLOWED_STICKERS).toHaveLength(32);
    expect(ALLOWED_STICKERS).toContain('🎲');
  });

  it('migrations : colonnes users.sticker et users.avatar_path', () => {
    const cols = (getDb().pragma('table_info(users)') as { name: string }[]).map((c) => c.name);
    expect(cols).toContain('sticker');
    expect(cols).toContain('avatar_path');
  });
});
