import { describe, it, expect } from 'vitest';
import { registerUser } from '@/lib/auth';
import { createGame } from '@/lib/games';
import { getDb } from '@/lib/db';
import {
  createNight, addNightGame, removeNightGame, toggleNightVote, toggleNightVeto,
  getShelfVotes, getShelfVetos,
} from '@/lib/nights';

const uid = (p: string) => (registerUser(p, '1234') as { id: number }).id;

describe('toggleNightVeto (v4.13.0)', () => {
  it('poser, retirer ; nommé ; les 👍 du jeu sont gardés', () => {
    const marc = uid('vo_marc'); const lea = uid('vo_lea');
    const g = createGame(marc, { title: 'Gloomhaven', box_format: 'grand' });
    const n = createNight(marc, [marc, lea]);
    addNightGame(n, g, marc);
    toggleNightVote(n, g, marc);

    expect(toggleNightVeto(n, g, lea)).toEqual({ ok: true });
    expect(getShelfVetos(n)).toEqual([{ game_id: g, user_id: lea, pseudo: 'vo_lea' }]);
    expect(getShelfVotes(n)).toHaveLength(1); // le 👍 de Marc reste

    expect(toggleNightVeto(n, g, lea)).toEqual({ ok: true }); // révocable
    expect(getShelfVetos(n)).toEqual([]);
  });

  it('1 veto par joueur et par partie ; un jeu déjà écarté ne se re-veto pas', () => {
    const marc = uid('vq_marc'); const lea = uid('vq_lea');
    const g1 = createGame(marc, { title: 'Azul', box_format: 'moyen' });
    const g2 = createGame(marc, { title: 'Catan', box_format: 'moyen' });
    const n = createNight(marc, [marc, lea]);
    addNightGame(n, g1, marc); addNightGame(n, g2, marc);

    expect(toggleNightVeto(n, g1, lea)).toEqual({ ok: true });
    const deux = toggleNightVeto(n, g2, lea);
    expect('error' in deux && deux.status).toBe(409); // quota atteint
    const deja = toggleNightVeto(n, g1, marc);
    expect('error' in deja && deja.status).toBe(409); // seul Léa le retire
    expect(getShelfVetos(n)).toHaveLength(1);
    // un veto par partie : la même joueuse peut en poser un dans une autre partie
    const n2 = createNight(marc, [marc, lea]);
    addNightGame(n2, g2, marc);
    expect(toggleNightVeto(n2, g2, lea)).toEqual({ ok: true });
  });

  it('gardes : non-joueur 403, hors étagère 403, partie lancée 409', () => {
    const marc = uid('vg_marc'); const zarb = uid('vg_z');
    const g = createGame(marc, { title: 'Wingspan', box_format: 'moyen' });
    const n = createNight(marc, [marc]);
    addNightGame(n, g, marc);
    const r1 = toggleNightVeto(n, g, zarb);
    expect('error' in r1 && r1.status).toBe(403);
    const r2 = toggleNightVeto(n, g + 1, marc);
    expect('error' in r2 && r2.status).toBe(403);
    getDb().prepare(`UPDATE nights SET status = 'en_jeu' WHERE id = ?`).run(n);
    const r3 = toggleNightVeto(n, g, marc);
    expect('error' in r3 && r3.status).toBe(409);
  });

  it('une boîte retirée emporte son veto', () => {
    const marc = uid('vr_marc');
    const g = createGame(marc, { title: 'Dixit', box_format: 'moyen' });
    const n = createNight(marc, [marc]);
    addNightGame(n, g, marc);
    toggleNightVeto(n, g, marc);
    removeNightGame(n, g, marc);
    expect(getShelfVetos(n)).toEqual([]);
  });
});
