import { getDb } from './db';
import type { Game, Night, Pick, UserLite } from './types';

export function getActiveNight(userId: number): Night | null {
  return (getDb().prepare(`
    SELECT n.* FROM nights n
    WHERE n.played_at = date('now','localtime')
      AND n.ended_at IS NULL
      AND (n.creator_id = ? OR EXISTS (SELECT 1 FROM night_players np WHERE np.night_id = n.id AND np.user_id = ?))
    ORDER BY n.id DESC LIMIT 1`).get(userId, userId) as Night | undefined) ?? null;
}

// Terminer la soirée : elle quitte l'état actif, l'historique la conserve.
export function endNight(nightId: number): void {
  getDb().prepare("UPDATE nights SET ended_at = datetime('now','localtime') WHERE id = ?").run(nightId);
}

// Soirées à venir (créateur OU participant), la plus proche d'abord.
export function getPlannedNights(userId: number): Night[] {
  return getDb().prepare(`
    SELECT n.* FROM nights n
    WHERE n.played_at > date('now','localtime')
      AND (n.creator_id = ? OR EXISTS (SELECT 1 FROM night_players np WHERE np.night_id = n.id AND np.user_id = ?))
    ORDER BY n.played_at ASC, n.id ASC`).all(userId, userId) as Night[];
}

export function createNight(creatorId: number, playerIds: number[], opts?: { playedAt?: string; startTime?: string | null }): number {
  const info = getDb()
    .prepare(`INSERT INTO nights (creator_id, played_at, start_time) VALUES (?, COALESCE(?, date('now','localtime')), ?)`)
    .run(creatorId, opts?.playedAt ?? null, opts?.startTime ?? null);
  const nightId = Number(info.lastInsertRowid);
  setNightPlayers(nightId, playerIds.includes(creatorId) ? playerIds : [...playerIds, creatorId]);
  return nightId;
}
export function getNight(nightId: number): Night | null {
  return (getDb().prepare('SELECT * FROM nights WHERE id = ?').get(nightId) as Night | undefined) ?? null;
}
export function setNightPlayers(nightId: number, playerIds: number[]): void {
  const db = getDb();
  db.prepare('DELETE FROM night_players WHERE night_id = ?').run(nightId);
  const ins = db.prepare('INSERT OR IGNORE INTO night_players (night_id, user_id) VALUES (?, ?)');
  for (const id of new Set(playerIds)) ins.run(nightId, id);
}
export function getNightPlayers(nightId: number): UserLite[] {
  return getDb().prepare(`
    SELECT u.id, u.pseudo, u.sticker, u.avatar_path FROM night_players np JOIN users u ON u.id = np.user_id
    WHERE np.night_id = ? ORDER BY u.pseudo`).all(nightId) as UserLite[];
}
export function userCanAccessNight(userId: number, nightId: number): boolean {
  return !!getDb().prepare(`
    SELECT 1 FROM nights n WHERE n.id = ? AND
      (n.creator_id = ? OR EXISTS (SELECT 1 FROM night_players np WHERE np.night_id = n.id AND np.user_id = ?))`)
    .get(nightId, userId, userId);
}
export function getMyNights(userId: number): Night[] {
  return getDb().prepare(`
    SELECT n.* FROM nights n
    WHERE n.creator_id = ?
       OR EXISTS (SELECT 1 FROM night_players np WHERE np.night_id = n.id AND np.user_id = ?)
    ORDER BY n.played_at DESC, n.id DESC`)
    .all(userId, userId) as Night[];
}
export type ShelfGame = Game & {
  owner_pseudo: string; owner_sticker: string | null; owner_avatar_path: string | null;
};
// Étagère v3 : une soirée commence avec une étagère VIDE. Chaque joueur y ajoute,
// depuis SA ludothèque (jeux perso + ceux de son foyer), ce dont il a envie ce soir.
// « owner_* » porte le pseudo de celui qui a posé la boîte sur l'étagère.
export function getShelfGames(nightId: number): ShelfGame[] {
  return getDb().prepare(`
    SELECT g.*, u.pseudo AS owner_pseudo, u.sticker AS owner_sticker, u.avatar_path AS owner_avatar_path
    FROM night_games ng
    JOIN games g ON g.id = ng.game_id
    JOIN users u ON u.id = ng.added_by
    WHERE ng.night_id = ?
    ORDER BY CASE g.box_format WHEN 'grand' THEN 0 WHEN 'moyen' THEN 1 WHEN 'petit' THEN 2 ELSE 3 END, g.title`)
    .all(nightId) as ShelfGame[];
}
export function isGameOnShelf(nightId: number, gameId: number): boolean {
  return !!getDb().prepare('SELECT 1 FROM night_games WHERE night_id = ? AND game_id = ?').get(nightId, gameId);
}
export type NightGameResult = { ok: true } | { error: string; status: number };

// Ajouter un jeu à la soirée : réservé aux joueurs présents, et seulement
// un jeu de SA ludothèque. Un doublon d'ajout est ignoré (premier ajouteur = badge).
export function addNightGame(nightId: number, gameId: number, userId: number): NightGameResult {
  const db = getDb();
  if (!getNight(nightId)) return { error: 'Soirée introuvable', status: 404 };
  if (!isNightParticipant(nightId, userId)) return { error: 'Seuls les joueurs de la soirée peuvent ajouter des jeux', status: 403 };
  const g = db.prepare('SELECT owner_id, foyer_id FROM games WHERE id = ?').get(gameId) as { owner_id: number; foyer_id: number | null } | undefined;
  if (!g) return { error: 'Jeu introuvable', status: 404 };
  const myFoyerId = (db.prepare('SELECT foyer_id FROM users WHERE id = ?').get(userId) as { foyer_id: number | null }).foyer_id;
  const inMyLibrary = g.foyer_id != null ? g.foyer_id === myFoyerId : g.owner_id === userId;
  if (!inMyLibrary) return { error: "Ce jeu n'est pas dans votre ludothèque", status: 403 };
  db.prepare('INSERT OR IGNORE INTO night_games (night_id, game_id, added_by) VALUES (?, ?, ?)').run(nightId, gameId, userId);
  return { ok: true };
}

// Retirer un jeu de la soirée : n'importe quel joueur présent peut le faire.
export function removeNightGame(nightId: number, gameId: number, userId: number): NightGameResult {
  if (!isNightParticipant(nightId, userId)) return { error: 'Seuls les joueurs de la soirée peuvent retirer des jeux', status: 403 };
  getDb().prepare('DELETE FROM night_games WHERE night_id = ? AND game_id = ?').run(nightId, gameId);
  return { ok: true };
}
export function isNightParticipant(nightId: number, userId: number): boolean {
  return !!getDb().prepare('SELECT 1 FROM night_players WHERE night_id = ? AND user_id = ?').get(nightId, userId);
}
export function getNightPicks(nightId: number): (Pick & { title: string; pseudo: string })[] {
  return getDb().prepare(`
    SELECT p.*, g.title, u.pseudo FROM picks p
    JOIN games g ON g.id = p.game_id JOIN users u ON u.id = p.spinner_id
    WHERE p.night_id = ? ORDER BY p.id DESC`).all(nightId) as (Pick & { title: string; pseudo: string })[];
}
