import { describe, it, expect } from 'vitest';
import { getDb, runMigrations } from '@/lib/db';

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
});
