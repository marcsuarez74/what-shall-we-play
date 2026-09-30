import { describe, it, expect } from 'vitest';
import { registerUser } from '@/lib/auth';
import { createNight, getShelfGames, excludeGame, restoreGame, getExcludedGameIds, getExcludedGames, isGameOnShelf } from '@/lib/nights';
import { createGame } from '@/lib/games';
import { getDb } from '@/lib/db';

const uid = (p: string) => (registerUser(p, '1234') as { id: number }).id;

describe('pas ce soir', () => {
  it('exclut un jeu d’une nuit SANS toucher aux autres nuits', () => {
    const marc = uid('x-marc');
    const g1 = createGame(marc, { title: 'Azul', box_format: 'petit' });
    const g2 = createGame(marc, { title: 'Dune', box_format: 'grand' });
    const n1 = createNight(marc, [marc]);
    const n2 = createNight(marc, [marc]);
    excludeGame(n1, g1);
    expect(getExcludedGameIds(n1)).toEqual([g1]);
    expect(getExcludedGameIds(n2)).toEqual([]); // portée soirée seulement
    expect(getShelfGames(n1).map((g) => g.id)).toEqual([g2]);
    expect(getShelfGames(n2).map((g) => g.id).sort()).toEqual([g1, g2].sort());
    restoreGame(n1, g1);
    expect(getShelfGames(n1).map((g) => g.id).sort()).toEqual([g1, g2].sort());
  });

  it('l’exclusion disparaît avec la nuit (cascade)', () => {
    const marc = uid('x-casc');
    const g = createGame(marc, { title: 'Jaipur', box_format: 'mini' });
    const n = createNight(marc, [marc]);
    excludeGame(n, g);
    expect(getExcludedGameIds(n)).toEqual([g]);
    getDb().prepare('DELETE FROM nights WHERE id = ?').run(n);
    expect(getExcludedGameIds(n)).toEqual([]); // ON DELETE CASCADE
  });

  it('l’étagère expose le propriétaire (pseudo + sticker)', () => {
    const marc = uid('x-owner');
    const lea = uid('x-owner-lea');
    getDb().prepare("UPDATE users SET sticker = '🦊' WHERE id = ?").run(marc);
    const n = createNight(marc, [marc, lea]);
    const g = createGame(marc, { title: 'Meadow', box_format: 'moyen' });
    const row = getShelfGames(n).find((x) => x.id === g);
    expect(row?.owner_pseudo).toBe('x-owner');
    expect(row?.owner_sticker).toBe('🦊');
    expect(row?.owner_avatar_path).toBeNull();
  });

  it('garde : on n’exclut pas un jeu hors de l’étagère de la nuit', () => {
    const marc = uid('x-garde');
    const autre = uid('x-garde-autre');
    const n = createNight(marc, [marc]);
    const mien = createGame(marc, { title: 'Sur l’étagère', box_format: 'petit' });
    const lointain = createGame(autre, { title: 'Loin', box_format: 'petit' });
    expect(isGameOnShelf(n, mien)).toBe(true);
    expect(isGameOnShelf(n, lointain)).toBe(false); // le handler refusera (400)
  });

  it('getExcludedGames renvoie les jeux écartés avec le propriétaire', () => {
    const marc = uid('x-excl-list');
    const lea = uid('x-excl-list-lea');
    getDb().prepare("UPDATE users SET sticker = '🦊' WHERE id = ?").run(marc);
    const n = createNight(marc, [marc, lea]);
    const g = createGame(marc, { title: 'Écarté', box_format: 'petit' });
    excludeGame(n, g);
    const list = getExcludedGames(n);
    expect(list.map((x) => x.id)).toEqual([g]);
    expect(list[0]?.owner_pseudo).toBe('x-excl-list');
    expect(list[0]?.owner_sticker).toBe('🦊');
    restoreGame(n, g);
    expect(getExcludedGames(n)).toEqual([]);
  });
});
