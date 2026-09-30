import { describe, it, expect } from 'vitest';
import { getDb } from '@/lib/db';

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
});
