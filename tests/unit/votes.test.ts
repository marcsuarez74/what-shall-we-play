import { describe, it, expect } from 'vitest';
import { registerUser } from '@/lib/auth';
import { createGame } from '@/lib/games';
import { getDb } from '@/lib/db';
import {
  createNight, addNightGame, removeNightGame, toggleNightVote,
  getShelfVotes, getNightPlayers, validateSelection, setNightPlayers,
} from '@/lib/nights';

const uid = (p: string) => (registerUser(p, '1234') as { id: number }).id;

describe('toggleNightVote', () => {
  it('bascule : vote → présent, re-vote → absent ; deux joueurs sur le même jeu → total 2', () => {
    const marc = uid('vt-marc'); const lea = uid('vt-lea');
    const g = createGame(marc, { title: 'Cascadia', box_format: 'grand' });
    const n = createNight(marc, [marc, lea]);
    addNightGame(n, g, marc);

    expect(toggleNightVote(n, g, marc)).toEqual({ ok: true });
    expect(getShelfVotes(n)).toEqual([{ game_id: g, user_id: marc, pseudo: 'vt-marc' }]);
    expect(toggleNightVote(n, g, lea)).toEqual({ ok: true }); // second joueur
    expect(getShelfVotes(n)).toHaveLength(2); // pas de doublon, pas de fusion

    expect(toggleNightVote(n, g, marc)).toEqual({ ok: true }); // retirer SON vote
    expect(getShelfVotes(n)).toHaveLength(1); // le vote de Léa reste
    expect(getShelfVotes(n)[0].pseudo).toBe('vt-lea');
  });

  it('gardes : partie inconnue 404, non-participant 403, jeu hors étagère 403, en_jeu 409', () => {
    const marc = uid('vt-gm'); const lea = uid('vt-gl'); const zarb = uid('vt-gz');
    const g = createGame(marc, { title: 'Wingspan', box_format: 'moyen' });
    const n = createNight(marc, [marc, lea]);
    addNightGame(n, g, marc);

    expect(toggleNightVote(99999, g, marc)).toEqual({ error: 'Partie introuvable', status: 404 });
    const rnp = toggleNightVote(n, g, zarb);
    expect('error' in rnp && rnp.status).toBe(403); // pas joueur de la soirée
    const rhe = toggleNightVote(n, g + 1, marc);
    expect('error' in rhe && rhe.status).toBe(403); // jeu pas sur l'étagère

    getDb().prepare(`UPDATE nights SET status = 'en_jeu' WHERE id = ?`).run(n);
    const r = toggleNightVote(n, g, marc);
    expect('error' in r && r.error).toBe('La partie a commencé — les votes sont figés');
    expect('error' in r && r.status).toBe(409);

    getDb().prepare(`UPDATE nights SET status = 'termine' WHERE id = ?`).run(n);
    const rt = toggleNightVote(n, g, marc);
    expect('error' in rt && rt.error).toBe('La soirée est terminée — les votes sont figés');
    expect('error' in rt && rt.status).toBe(409);
  });

  it('voter ne saute jamais la validation (contrairement à l ajout/retrait d une boîte)', () => {
    const marc = uid('vt-val'); const lea = uid('vt-l2');
    const g = createGame(marc, { title: 'Azul', box_format: 'petit' });
    const n = createNight(marc, [marc, lea]);
    addNightGame(n, g, marc);
    validateSelection(n, marc);
    expect(getNightPlayers(n).find((p) => p.id === marc)?.validated_at).toBeTruthy();

    toggleNightVote(n, g, marc);
    toggleNightVote(n, g, marc); // dans les deux sens
    expect(getNightPlayers(n).find((p) => p.id === marc)?.validated_at).toBeTruthy();
  });

  it('une boîte retirée emporte ses votes (pas de vote fantôme)', () => {
    const marc = uid('vt-rm'); const lea = uid('vt-rl');
    const g = createGame(marc, { title: '7 Wonders', box_format: 'moyen' });
    const n = createNight(marc, [marc, lea]);
    addNightGame(n, g, marc);
    toggleNightVote(n, g, marc);
    toggleNightVote(n, g, lea);
    removeNightGame(n, g, marc);
    expect(getShelfVotes(n)).toEqual([]);
  });

  it('un joueur retiré de la soirée emporte ses votes (pas de vote fantôme)', () => {
    const marc = uid('vt-pj'); const lea = uid('vt-pl');
    const g = createGame(marc, { title: 'Cascadia', box_format: 'grand' });
    const n = createNight(marc, [marc, lea]);
    addNightGame(n, g, marc);
    toggleNightVote(n, g, marc);
    toggleNightVote(n, g, lea);

    setNightPlayers(n, [marc]); // léa retirée de la soirée
    expect(getShelfVotes(n)).toEqual([{ game_id: g, user_id: marc, pseudo: 'vt-pj' }]);

    setNightPlayers(n, [marc, lea]); // léa re-ajoutée
    expect(getShelfVotes(n)).toEqual([{ game_id: g, user_id: marc, pseudo: 'vt-pj' }]); // son vote ne revient pas
  });
});
