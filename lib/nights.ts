import { getDb } from './db';
import type { Game, Night, Pick, UserLite } from './types';

export function getCurrentNight(userId: number): Night | null {
  return (getDb().prepare(
    `SELECT * FROM nights WHERE creator_id = ? AND played_at = date('now','localtime') ORDER BY id DESC LIMIT 1`)
    .get(userId) as Night | undefined) ?? null;
}
export function getNight(nightId: number): Night | null {
  return (getDb().prepare('SELECT * FROM nights WHERE id = ?').get(nightId) as Night | undefined) ?? null;
}
export function createNight(creatorId: number, playerIds: number[]): number {
  const info = getDb().prepare('INSERT INTO nights (creator_id) VALUES (?)').run(creatorId);
  const nightId = Number(info.lastInsertRowid);
  setNightPlayers(nightId, playerIds.includes(creatorId) ? playerIds : [...playerIds, creatorId]);
  return nightId;
}
export function setNightPlayers(nightId: number, playerIds: number[]): void {
  const db = getDb();
  db.prepare('DELETE FROM night_players WHERE night_id = ?').run(nightId);
  const ins = db.prepare('INSERT OR IGNORE INTO night_players (night_id, user_id) VALUES (?, ?)');
  for (const id of new Set(playerIds)) ins.run(nightId, id);
}
export function getNightPlayers(nightId: number): UserLite[] {
  return getDb().prepare(`
    SELECT u.id, u.pseudo FROM night_players np JOIN users u ON u.id = np.user_id
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
export function getShelfGames(nightId: number): Game[] {
  return getDb().prepare(`
    SELECT DISTINCT g.* FROM games g
    JOIN night_players np ON np.user_id = g.owner_id
    WHERE np.night_id = ?
    ORDER BY CASE g.box_format WHEN 'grand' THEN 0 WHEN 'moyen' THEN 1 WHEN 'petit' THEN 2 ELSE 3 END, g.title`)
    .all(nightId) as Game[];
}
export function getNightPicks(nightId: number): (Pick & { title: string; pseudo: string })[] {
  return getDb().prepare(`
    SELECT p.*, g.title, u.pseudo FROM picks p
    JOIN games g ON g.id = p.game_id JOIN users u ON u.id = p.spinner_id
    WHERE p.night_id = ? ORDER BY p.id DESC`).all(nightId) as (Pick & { title: string; pseudo: string })[];
}
