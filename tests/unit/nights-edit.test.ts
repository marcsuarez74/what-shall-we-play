import { describe, it, expect } from 'vitest';
import { registerUser } from '@/lib/auth';
import { createGame } from '@/lib/games';
// Tasks 2-3 étendront cet import avec supprimerNuit puis creerNuitRetro (et getMyParties en Task 5).
import { createNight, corrigerNuit, getNight, getNightScores, getNightPlayers } from '@/lib/nights';
import { poserVerdict } from '@/lib/verdicts';
import { getDb } from '@/lib/db';

const hier = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE');
const demain = new Date(Date.now() + 86400000).toLocaleDateString('sv-SE');

/** Nuit terminée avec scores, prête à corriger. */
function nuitTerminee() {
  const marc = (registerUser(`e-marc-${Math.random().toString(36).slice(2, 8)}`, '1234') as { id: number }).id;
  const lea = (registerUser(`e-lea-${Math.random().toString(36).slice(2, 8)}`, '1234') as { id: number }).id;
  const game = createGame(marc, { title: 'Cascadia', box_format: 'grand' });
  const nightId = createNight(marc, [marc, lea]);
  getDb().prepare(`UPDATE nights SET game_id = ?, status = 'termine', ended_at = datetime('now','localtime') WHERE id = ?`).run(game, nightId);
  getDb().prepare('INSERT OR REPLACE INTO night_scores (night_id, user_id, score) VALUES (?, ?, ?)').run(nightId, marc, 78);
  getDb().prepare('INSERT OR REPLACE INTO night_scores (night_id, user_id, score) VALUES (?, ?, ?)').run(nightId, lea, 71);
  return { marc, lea, autre: (registerUser(`e-autre-${Math.random().toString(36).slice(2, 8)}`, '1234') as { id: number }).id, game, game2: createGame(marc, { title: 'Everdell', box_format: 'moyen' }), nightId };
}

describe('corrigerNuit', () => {
  it('droits : créateur et participant peuvent corriger, un autre reçoit 404', () => {
    const n = nuitTerminee();
    expect(corrigerNuit(n.nightId, n.marc, { scores: { [n.marc]: 80 } })).toEqual({ ok: true });
    expect(corrigerNuit(n.nightId, n.lea, { scores: { [n.lea]: 72 } })).toEqual({ ok: true });
    expect((corrigerNuit(n.nightId, n.autre, { scores: { [n.marc]: 1 } }) as { status: number }).status).toBe(404);
  });
  it('date : passée ou aujourd\'hui ok, jamais dans le futur (400)', () => {
    const n = nuitTerminee();
    expect(corrigerNuit(n.nightId, n.marc, { playedAt: hier })).toEqual({ ok: true });
    expect(getNight(n.nightId)!.played_at).toBe(hier);
    expect((corrigerNuit(n.nightId, n.marc, { playedAt: demain }) as { status: number }).status).toBe(400);
    expect((corrigerNuit(n.nightId, n.marc, { playedAt: 'pas-une-date' }) as { status: number }).status).toBe(400);
  });
  it('changement de jeu → verdicts réinitialisés ; même jeu → verdicts intacts', () => {
    const n = nuitTerminee();
    poserVerdict(n.nightId, n.marc, 'adore');
    expect(corrigerNuit(n.nightId, n.marc, { gameId: n.game })).toEqual({ ok: true }); // même jeu
    expect((getDb().prepare('SELECT COUNT(*) AS c FROM night_verdicts WHERE night_id = ?').get(n.nightId) as { c: number }).c).toBe(1);
    expect(corrigerNuit(n.nightId, n.marc, { gameId: n.game2 })).toEqual({ ok: true }); // autre jeu
    expect((getDb().prepare('SELECT COUNT(*) AS c FROM night_verdicts WHERE night_id = ?').get(n.nightId) as { c: number }).c).toBe(0);
    expect(getNight(n.nightId)!.game_id).toBe(n.game2);
  });
  it('retrait d\'un participant → ses scores et ses votes partent ; scores upsert', () => {
    const n = nuitTerminee();
    getDb().prepare('INSERT OR IGNORE INTO game_votes (night_id, game_id, user_id) VALUES (?, ?, ?)').run(n.nightId, n.game, n.lea);
    expect(corrigerNuit(n.nightId, n.marc, { playerIds: [n.marc] })).toEqual({ ok: true });
    expect(getNightPlayers(n.nightId).map((p) => p.id)).toEqual([n.marc]);
    expect(getNightScores(n.nightId).map((s) => s.user_id)).toEqual([n.marc]); // les scores de lea partis
    expect((getDb().prepare('SELECT COUNT(*) AS c FROM game_votes WHERE night_id = ?').get(n.nightId) as { c: number }).c).toBe(0);
    expect((corrigerNuit(n.nightId, n.marc, { scores: { [n.marc]: 82, [n.lea]: 1 } }) as { status: number }).status).toBe(400); // score d'un absent
    expect(corrigerNuit(n.nightId, n.marc, { scores: { [n.marc]: 82 } })).toEqual({ ok: true });
    expect(getNightScores(n.nightId)[0].score).toBe(82);
  });
  it('seule une nuit terminée se corrige (409) ; joueur inconnu (400)', () => {
    const marc = (registerUser(`e-vif-${Math.random().toString(36).slice(2, 8)}`, '1234') as { id: number }).id;
    const nightId = createNight(marc, [marc]); // status 'creation'
    expect((corrigerNuit(nightId, marc, { playedAt: hier }) as { status: number }).status).toBe(409);
    const n = nuitTerminee();
    expect((corrigerNuit(n.nightId, n.marc, { playerIds: [999999] }) as { status: number }).status).toBe(400);
  });
});
