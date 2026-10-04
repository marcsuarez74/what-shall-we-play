import { describe, it, expect } from 'vitest';
import { registerUser } from '@/lib/auth';
import { createGame } from '@/lib/games';
// Task 5 étendra cet import avec getMyParties.
import { createNight, corrigerNuit, getNight, getNightScores, getNightPlayers, supprimerNuit, creerNuitRetro } from '@/lib/nights';
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

describe('supprimerNuit', () => {
  it('créateur OU participant supprime ; un autre reçoit 404', () => {
    const n = nuitTerminee();
    expect(supprimerNuit(n.nightId, n.lea)).toEqual({ ok: true });
    const n2 = nuitTerminee();
    expect((supprimerNuit(n2.nightId, n2.autre) as { status: number }).status).toBe(404);
    expect(getNight(n2.nightId)).not.toBeNull();
  });
  it('CASCADE : nuit avec picks → joueurs, scores, picks, verdicts tous partis', () => {
    const n = nuitTerminee();
    getDb().prepare('INSERT INTO picks (night_id, game_id, spinner_id) VALUES (?, ?, ?)').run(n.nightId, n.game, n.marc);
    poserVerdict(n.nightId, n.marc, 'bien');
    expect(supprimerNuit(n.nightId, n.marc)).toEqual({ ok: true });
    expect(getNight(n.nightId)).toBeNull();
    for (const table of ['night_players', 'night_scores', 'picks', 'night_verdicts'])
      expect((getDb().prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE night_id = ?`).get(n.nightId) as { c: number }).c).toBe(0);
  });
});

describe('creerNuitRetro', () => {
  it('crée directement terminée : jeu posé, joueurs, scores, créateur = l\'auteur', () => {
    const marc = (registerUser(`e-r-marc-${Math.random().toString(36).slice(2, 8)}`, '1234') as { id: number }).id;
    const lea = (registerUser(`e-r-lea-${Math.random().toString(36).slice(2, 8)}`, '1234') as { id: number }).id;
    const game = createGame(marc, { title: 'Dune', box_format: 'grand' });
    const res = creerNuitRetro(marc, { playedAt: hier, gameId: game, playerIds: [lea], scores: { [marc]: 44, [lea]: 39 } });
    expect((res as { ok: boolean }).ok).toBe(true);
    const night = getNight((res as { nightId: number }).nightId)!;
    expect(night.status).toBe('termine');
    expect(night.game_id).toBe(game);
    expect(night.creator_id).toBe(marc);
    expect(night.played_at).toBe(hier);
    expect(getNightPlayers(night.id).map((p) => p.id).sort()).toEqual([marc, lea].sort()); // créateur auto-ajouté
    expect(Object.fromEntries(getNightScores(night.id).map((s) => [s.user_id, s.score]))).toEqual({ [marc]: 44, [lea]: 39 });
  });
  it('date future rejetée (400) ; score d\'un absent rejeté (400) ; nuit hors stats d\'autrui', () => {
    const marc = (registerUser(`e-r2-${Math.random().toString(36).slice(2, 8)}`, '1234') as { id: number }).id;
    const game = createGame(marc, { title: 'Azul', box_format: 'petit' });
    expect((creerNuitRetro(marc, { playedAt: demain, gameId: game, playerIds: [marc] }) as { status: number }).status).toBe(400);
    const res = creerNuitRetro(marc, { playedAt: hier, gameId: game, playerIds: [marc], scores: { [999999]: 5 } });
    expect((res as { status: number }).status).toBe(400);
  });
});
