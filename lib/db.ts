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
-- v2.0.0 (étagère v3) : ce que chaque joueur a ajouté à la soirée depuis sa ludothèque.
-- night_excludes reste en base pour l'historique (le « Pas ce soir » n'existe plus).
CREATE TABLE IF NOT EXISTS night_games (
  night_id INTEGER NOT NULL REFERENCES nights(id) ON DELETE CASCADE,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  added_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(night_id, game_id)
);
CREATE TABLE IF NOT EXISTS night_scores (
  night_id INTEGER NOT NULL REFERENCES nights(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score REAL,
  UNIQUE(night_id, user_id)
);
CREATE TABLE IF NOT EXISTS bug_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  titre TEXT NOT NULL,
  issue_url TEXT,
  capture_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
-- v3.5.0 (vote sur l'étagère) : les envies du soir — UNIQUE par (soirée, jeu, joueur),
-- révocable (la bascule est dans lib/nights). Une boîte retirée emporte ses votes.
CREATE TABLE IF NOT EXISTS game_votes (
  night_id INTEGER NOT NULL REFERENCES nights(id) ON DELETE CASCADE,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(night_id, game_id, user_id)
);
-- v3.7.0 (verdict du jeu) : le ressenti après la soirée — UNIQUE par (nuit, joueur),
-- révocable (revoter remplace). game_id est copié de nights.game_id au moment du vote
-- (mis à jour à chaque re-vote) pour que les agrégats évitent les jointures.
CREATE TABLE IF NOT EXISTS night_verdicts (
  night_id INTEGER NOT NULL REFERENCES nights(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  verdict TEXT NOT NULL CHECK (verdict IN ('adore','bien','neutre')),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(night_id, user_id)
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
CREATE TABLE IF NOT EXISTS foyers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

let db: Database.Database | null = null;

// Migrations incrémentales v1 : ALTER idempotent (« duplicate column » = déjà en place).
export function runMigrations(db: Database.Database): void {
  for (const stmt of [
    'ALTER TABLE games ADD COLUMN designer TEXT',
    'ALTER TABLE games ADD COLUMN artist TEXT',
    'ALTER TABLE games ADD COLUMN best_players INTEGER',
    'ALTER TABLE nights ADD COLUMN start_time TEXT',
    'ALTER TABLE nights ADD COLUMN ended_at TEXT',
    'ALTER TABLE users ADD COLUMN sticker TEXT',
    'ALTER TABLE users ADD COLUMN avatar_path TEXT',
    'ALTER TABLE users ADD COLUMN foyer_id INTEGER REFERENCES foyers(id)',
    'ALTER TABLE games ADD COLUMN foyer_id INTEGER REFERENCES foyers(id)',
    'ALTER TABLE night_players ADD COLUMN validated_at TEXT',
    "ALTER TABLE nights ADD COLUMN status TEXT NOT NULL DEFAULT 'creation'",
    'ALTER TABLE nights ADD COLUMN game_id INTEGER REFERENCES games(id)',
    // v4.0.0 (traduction EN) : langue du compte — lue uniquement par login/register
    // pour amorcer le cookie wsp_lang (le compte ne force jamais le navigateur).
    "ALTER TABLE users ADD COLUMN lang TEXT NOT NULL DEFAULT 'fr'",
  ]) {
    try { db.exec(stmt); } catch { /* colonne déjà présente */ }
  }
  // v3.3 : les soirées archivées avant l'existence des états deviennent « termine ».
  db.prepare(`UPDATE nights SET status = 'termine' WHERE ended_at IS NOT NULL AND status = 'creation'`).run();
}

export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  runMigrations(db);
  return db;
}
