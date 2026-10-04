import { describe, it, expect } from 'vitest';
import { getDb, runMigrations } from '@/lib/db';
import { registerUser } from '@/lib/auth';
import { createGame } from '@/lib/games';
import { createNight, addNightGame, boxOutNight, endNight } from '@/lib/nights';
import { poserVerdict } from '@/lib/verdicts';

describe('db', () => {
  it('crée toutes les tables du schéma', () => {
    const db = getDb();
    const tables = db.prepare<unknown[], { name: string }>(`SELECT name FROM sqlite_master WHERE type='table'`).all()
      .map((r: { name: string }) => r.name);
    for (const t of ['users','sessions','games','nights','night_players','picks','bgg_cache'])
      expect(tables).toContain(t);
  });
  it('active les clés étrangères et le mode WAL', () => {
    const db = getDb();
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
  });
  it('expose les colonnes enrichies de la fiche (designer, artist, best_players)', () => {
    const cols = (getDb().prepare('PRAGMA table_info(games)').all() as { name: string }[]).map((c) => c.name);
    for (const c of ['designer', 'artist', 'best_players']) expect(cols).toContain(c);
  });
  it('expose le cycle de vie v3.3 : nights.status, nights.game_id, night_scores', () => {
    const db = getDb();
    const cols = (db.prepare('PRAGMA table_info(nights)').all() as { name: string }[]).map((c) => c.name);
    for (const c of ['status', 'game_id']) expect(cols).toContain(c);
    const tables = db.prepare<unknown[], { name: string }>(`SELECT name FROM sqlite_master WHERE type='table'`).all()
      .map((r: { name: string }) => r.name);
    expect(tables).toContain('night_scores');
    // défaut : création
    const u = db.prepare(`INSERT INTO users (pseudo, code_hash) VALUES ('test-user', 'hash')`).run();
    const n = db.prepare(`INSERT INTO nights (creator_id) VALUES (?)`).run(u.lastInsertRowid);
    expect((db.prepare('SELECT status FROM nights WHERE id = ?').get(n.lastInsertRowid) as { status: string }).status).toBe('creation');
  });

  it('migre les soirées archivées (ended_at posé, pré-v3.3) en « termine »', () => {
    const db = getDb();
    const u = db.prepare(`INSERT INTO users (pseudo, code_hash) VALUES ('n-mig', 'x')`).run();
    const n = db.prepare(`INSERT INTO nights (creator_id, ended_at, status) VALUES (?, datetime('now','localtime'), 'creation')`).run(u.lastInsertRowid);
    runMigrations(db); // idempotent : rejouable à chaud
    expect((db.prepare('SELECT status FROM nights WHERE id = ?').get(n.lastInsertRowid) as { status: string }).status).toBe('termine');
  });

  it('v3.4 : table bug_reports prête (défaut de date locale, issue_url nullable)', () => {
    const db = getDb();
    const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[]).map((r) => r.name);
    expect(tables).toContain('bug_reports');
    const u = db.prepare(`INSERT INTO users (pseudo, code_hash) VALUES ('bug-user', 'x')`).run();
    const info = db.prepare(`INSERT INTO bug_reports (user_id, type, titre) VALUES (?, 'bug', 'test')`).run(u.lastInsertRowid);
    const row = db.prepare('SELECT created_at, issue_url, capture_name FROM bug_reports WHERE id = ?').get(info.lastInsertRowid) as { created_at: string; issue_url: string | null; capture_name: string | null };
    expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(row.issue_url).toBeNull();
    expect(row.capture_name).toBeNull();
  });

  it('v3.5 : table game_votes prête (UNIQUE par joueur, CASCADE, date locale)', () => {
    const db = getDb();
    const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[]).map((r) => r.name);
    expect(tables).toContain('game_votes');
    const marc = db.prepare(`INSERT INTO users (pseudo, code_hash) VALUES ('gv-marc', 'x')`).run();
    const lea = db.prepare(`INSERT INTO users (pseudo, code_hash) VALUES ('gv-lea', 'x')`).run();
    const night = db.prepare(`INSERT INTO nights (creator_id) VALUES (?)`).run(marc.lastInsertRowid);
    const game = db.prepare(`INSERT INTO games (owner_id, title, box_format) VALUES (?, 'Azul', 'moyen')`).run(marc.lastInsertRowid);
    db.prepare(`INSERT INTO game_votes (night_id, game_id, user_id) VALUES (?, ?, ?)`)
      .run(night.lastInsertRowid, game.lastInsertRowid, marc.lastInsertRowid);
    const row = db.prepare('SELECT created_at FROM game_votes WHERE night_id = ?').get(night.lastInsertRowid) as { created_at: string };
    expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    // UNIQUE : le même joueur ne vote pas deux fois
    expect(() => db.prepare(`INSERT INTO game_votes (night_id, game_id, user_id) VALUES (?, ?, ?)`)
      .run(night.lastInsertRowid, game.lastInsertRowid, marc.lastInsertRowid)).toThrow();
    // deux joueurs peuvent voter le même jeu
    db.prepare(`INSERT INTO game_votes (night_id, game_id, user_id) VALUES (?, ?, ?)`)
      .run(night.lastInsertRowid, game.lastInsertRowid, lea.lastInsertRowid);
    // suppression de la partie → votes emportés (CASCADE)
    db.prepare('DELETE FROM nights WHERE id = ?').run(night.lastInsertRowid);
    expect(db.prepare('SELECT COUNT(*) AS t FROM game_votes').get() as { t: number }).toEqual({ t: 0 });
  });

  it('night_verdicts : UNIQUE par (nuit, joueur) et CASCADE sur la nuit', () => {
    const marc = registerUser(`db-v-${Date.now().toString(36)}`, '1234') as { id: number };
    const nuit = createNight(marc.id, [marc.id]);
    const jeu = createGame(marc.id, { title: 'Cascadia', box_format: 'moyen' });
    addNightGame(nuit, jeu, marc.id); // sur l'étagère, pour pouvoir sortir la boîte
    boxOutNight(nuit, marc.id, jeu);
    endNight(nuit, marc.id, { [marc.id]: 10 });
    expect(poserVerdict(nuit, marc.id, 'adore')).toEqual({ ok: true });
    expect(poserVerdict(nuit, marc.id, 'bien')).toEqual({ ok: true }); // remplace, ne duplique pas
    const lignes = getDb().prepare('SELECT COUNT(*) AS n FROM night_verdicts WHERE night_id = ?').get(nuit) as { n: number };
    expect(lignes.n).toBe(1);
    // CASCADE : supprimer la nuit emporte ses verdicts
    getDb().prepare('DELETE FROM nights WHERE id = ?').run(nuit);
    expect(getDb().prepare('SELECT COUNT(*) AS n FROM night_verdicts WHERE night_id = ?').get(nuit)).toEqual({ n: 0 });
  });
});
