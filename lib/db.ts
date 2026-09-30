import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
export const DB_PATH = path.join(DATA_DIR, 'app.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pseudo TEXT NOT NULL COLLATE NOCASE UNIQUE,
  code_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bgg_id INTEGER, title TEXT NOT NULL, year INTEGER, publisher TEXT,
  cover_url TEXT, cover_path TEXT,
  min_players INTEGER, max_players INTEGER, playtime_min INTEGER,
  weight REAL, bgg_rating REAL, designer TEXT, artist TEXT, best_players INTEGER,
  box_format TEXT NOT NULL CHECK (box_format IN ('mini','petit','moyen','grand')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS nights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_id INTEGER NOT NULL REFERENCES users(id),
  played_at TEXT NOT NULL DEFAULT (date('now','localtime')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS night_players (
  night_id INTEGER NOT NULL REFERENCES nights(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(night_id, user_id)
);
CREATE TABLE IF NOT EXISTS night_excludes (
  night_id INTEGER NOT NULL REFERENCES nights(id) ON DELETE CASCADE,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  UNIQUE(night_id, game_id)
);
CREATE TABLE IF NOT EXISTS picks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  night_id INTEGER NOT NULL REFERENCES nights(id) ON DELETE CASCADE,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE RESTRICT,
  spinner_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS bgg_cache (
  bgg_id INTEGER PRIMARY KEY,
  payload_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
`;

let db: Database.Database | null = null;
export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  // Migrations incrémentales v1 : ALTER idempotent (« duplicate column » = déjà en place).
  for (const stmt of [
    'ALTER TABLE games ADD COLUMN designer TEXT',
    'ALTER TABLE games ADD COLUMN artist TEXT',
    'ALTER TABLE games ADD COLUMN best_players INTEGER',
    'ALTER TABLE users ADD COLUMN sticker TEXT',
    'ALTER TABLE users ADD COLUMN avatar_path TEXT',
  ]) {
    try { db.exec(stmt); } catch { /* colonne déjà présente */ }
  }
  return db;
}
