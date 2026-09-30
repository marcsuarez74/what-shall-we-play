import { describe, it, expect } from 'vitest';
import { registerUser } from '@/lib/auth';
import { createNight } from '@/lib/nights';
import { createGame } from '@/lib/games';
import { getDb } from '@/lib/db';
import { getProfileStats, setSticker, ALLOWED_STICKERS, deleteAccount } from '@/lib/users';

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

  it('deleteAccount : tout part, les soirées des autres restent', () => {
    const marc = uid('p-del-marc');
    const lea = uid('p-del-lea');
    const g = createGame(marc, { title: 'À supprimer', box_format: 'grand' });
    const nMarc = createNight(marc, [marc, lea]);
    const nLea = createNight(lea, [lea, marc]);
    pick(nMarc, g, marc);   // tirage de marc sur SA soirée
    pick(nLea, g, lea);     // tirage de léa sur le jeu de marc (RESTRICT game_id)
    const res = deleteAccount(marc);
    expect(res).toEqual({ ok: true, removedGames: 1 });
    const cnt = (sql: string, ...args: (string | number)[]) =>
      Number((getDb().prepare(sql).get(...args) as { n: number }).n);
    expect(cnt('SELECT COUNT(*) AS n FROM users WHERE id = ?', marc)).toBe(0);
    expect(cnt('SELECT COUNT(*) AS n FROM games WHERE owner_id = ?', marc)).toBe(0);
    expect(cnt('SELECT COUNT(*) AS n FROM picks WHERE game_id = ?', g)).toBe(0); // les 2 tirages visaient son jeu
    expect(cnt('SELECT COUNT(*) AS n FROM picks WHERE spinner_id = ?', marc)).toBe(0);
    expect(cnt('SELECT COUNT(*) AS n FROM nights WHERE id = ?', nMarc)).toBe(0); // sa soirée créée part
    expect(cnt('SELECT COUNT(*) AS n FROM nights WHERE id = ?', nLea)).toBe(1); // la soirée de léa reste
    expect(cnt('SELECT COUNT(*) AS n FROM night_players WHERE night_id = ?', nLea)).toBe(1); // sans marc
  });
});
