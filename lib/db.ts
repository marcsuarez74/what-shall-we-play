import Database from 'better-sqlite3';
import fs from 'node:fs';
import crypto from 'node:crypto';
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
-- « Se souvenir de moi » (v4.5.0) : jeton longue durée gardé par le client
-- (localStorage) pour restaurer une session quand le cookie de la PWA est perdu.
CREATE TABLE IF NOT EXISTS device_tokens (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
-- v4.14.0 (parties récurrentes) : une série relie des parties programmées ordinaires
-- (nights.serie_id). Titre, heure et invités vivent sur les parties ; la série ne garde que
-- le pas (1 ou 2 semaines) et son arrêt. Jamais supprimée : arrêtée.
CREATE TABLE IF NOT EXISTS series (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pas INTEGER NOT NULL CHECK (pas IN (1, 2)),
  arretee INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- v4.13.0 (veto) : « pas ce soir » — UN veto par joueur et par partie (UNIQUE), révocable
-- jusqu'au lancement. Écarte le jeu du tirage ; les 👍 du jeu sont gardés. Une boîte retirée
-- emporte son veto (lib/nights).
CREATE TABLE IF NOT EXISTS game_vetos (
  night_id INTEGER NOT NULL REFERENCES nights(id) ON DELETE CASCADE,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(night_id, user_id)
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
-- v4.8.0 : amitiés (une ligne par paire, user_a < user_b), cercles, invitations.
CREATE TABLE IF NOT EXISTS amities (
  user_a INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  etat TEXT NOT NULL CHECK (etat IN ('demande','ami')),
  demandeur INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_a, user_b),
  CHECK (user_a < user_b)
);
CREATE TABLE IF NOT EXISTS cercles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  lien_token TEXT NOT NULL UNIQUE,
  adhesion TEXT NOT NULL DEFAULT 'validation' CHECK (adhesion IN ('libre','validation')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS cercle_membres (
  cercle_id INTEGER NOT NULL REFERENCES cercles(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'membre' CHECK (role IN ('admin','membre')),
  etat TEXT NOT NULL DEFAULT 'membre' CHECK (etat IN ('membre','attente')),
  ajoute_par INTEGER,
  UNIQUE (cercle_id, user_id)
);
-- v4.9.0 : un abonnement push par appareil.
CREATE TABLE IF NOT EXISTS push_abonnements (
  endpoint TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- v4.10.0 : sondage de dates (plusieurs soirs proposés, chacun coche ses dispos).
CREATE TABLE IF NOT EXISTS sondages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  titre TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sondage_dates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sondage_id INTEGER NOT NULL REFERENCES sondages(id) ON DELETE CASCADE,
  played_at TEXT NOT NULL,
  start_time TEXT
);
CREATE TABLE IF NOT EXISTS sondage_invites (
  sondage_id INTEGER NOT NULL REFERENCES sondages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  via_cercle INTEGER REFERENCES cercles(id) ON DELETE SET NULL,
  UNIQUE (sondage_id, user_id)
);
CREATE TABLE IF NOT EXISTS sondage_reponses (
  date_id INTEGER NOT NULL REFERENCES sondage_dates(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dispo INTEGER NOT NULL DEFAULT 0 CHECK (dispo IN (0, 1)),
  UNIQUE (date_id, user_id)
);
CREATE TABLE IF NOT EXISTS night_invites (
  night_id INTEGER NOT NULL REFERENCES nights(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  etat TEXT NOT NULL DEFAULT 'attente' CHECK (etat IN ('attente','dispo','absent')),
  via_cercle INTEGER REFERENCES cercles(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (night_id, user_id)
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
    // v4.6.0 (invités par lien) : un invité est une ligne users marquée, rattachée
    // à son hôte ; la soirée porte un token de lien d'invitation.
    // NB : SQLite interdit ADD COLUMN … UNIQUE — l'unicité passe par un index
    // créé après la boucle (hors try/catch : une vraie erreur doit crier).
    'ALTER TABLE users ADD COLUMN est_invite INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE users ADD COLUMN host_id INTEGER REFERENCES users(id)',
    'ALTER TABLE nights ADD COLUMN lien_token TEXT',
    // v4.7.0 : titre facultatif d'une partie (repli d'affichage sur la date).
    'ALTER TABLE nights ADD COLUMN titre TEXT',
    // v4.8.0 : lien d'ami personnel (créé à la demande ; unicité par index plus bas).
    'ALTER TABLE users ADD COLUMN lien_ami TEXT',
    // v4.9.0 : types de notifications coupés (« reponses,amis ») ; rappel du jour J envoyé.
    "ALTER TABLE users ADD COLUMN notif_off TEXT NOT NULL DEFAULT ''",
    'ALTER TABLE nights ADD COLUMN rappel_envoye INTEGER NOT NULL DEFAULT 0',
    // v4.14.0 : la série d'une partie récurrente (NULL = partie ordinaire).
    'ALTER TABLE nights ADD COLUMN serie_id INTEGER REFERENCES series(id)',
  ]) {
    try { db.exec(stmt); } catch { /* colonne déjà présente */ }
  }
  // v3.3 : les soirées archivées avant l'existence des états deviennent « termine ».
  db.prepare(`UPDATE nights SET status = 'termine' WHERE ended_at IS NOT NULL AND status = 'creation'`).run();
  // v4.6.0 : unicité des tokens de lien — index idempotent, ERREUR BRUYANTE si échec.
  db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_nights_lien_token ON nights(lien_token)').run();
  // v4.7.2 (audit, point 6) : les jetons ne sont plus stockés qu'en empreinte sha256.
  // Une seule fois (user_version) : les sessions existantes restent valides.
  if ((db.pragma('user_version', { simple: true }) as number) < 1) {
    const hacher = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
    db.transaction(() => {
      for (const table of ['sessions', 'device_tokens']) {
        const maj = db.prepare(`UPDATE ${table} SET token = ? WHERE token = ?`);
        for (const { token } of db.prepare(`SELECT token FROM ${table}`).all() as { token: string }[]) maj.run(hacher(token), token);
      }
      db.pragma('user_version = 1');
    })();
  }
  db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_lien_ami ON users(lien_ami)').run();
  // v4.8.0 : les listes de joueurs ne montrent plus que les amis et le foyer. Une seule
  // fois : les comptes qui ont déjà joué une partie ensemble deviennent amis d'office
  // (personne ne retrouve une liste vide après la mise à jour).
  if ((db.pragma('user_version', { simple: true }) as number) < 2) {
    db.transaction(() => {
      db.prepare(`
        INSERT OR IGNORE INTO amities (user_a, user_b, etat, demandeur)
        SELECT DISTINCT a.user_id, b.user_id, 'ami', a.user_id
        FROM night_players a JOIN night_players b ON a.night_id = b.night_id AND a.user_id < b.user_id
        JOIN users ua ON ua.id = a.user_id AND ua.est_invite = 0
        JOIN users ub ON ub.id = b.user_id AND ub.est_invite = 0`).run();
      db.pragma('user_version = 2');
    })();
  }
}

// v4.7.2 (audit, point 7) — au démarrage : sessions expirées, jetons d'appareil
// inutilisés depuis un an (ils tournent à chaque restauration), invités sans soirée.
// Rien d'autre : une donnée de jeu n'est jamais détruite implicitement.
export function purger(db: Database.Database): void {
  db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
  db.prepare("DELETE FROM device_tokens WHERE created_at <= datetime('now', '-1 year')").run();
  db.prepare('DELETE FROM users WHERE est_invite = 1 AND id NOT IN (SELECT user_id FROM night_players)').run();
}

export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  runMigrations(db);
  purger(db);
  return db;
}
