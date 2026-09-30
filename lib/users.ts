import { getDb } from './db';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import { validateCode } from './auth';
import { coverPathOnDisk } from './storage';
import type { UserRow } from './types';

// Stickers d'avatar : grille validée (maquette profil v3) — serveur n'accepte que ceux-ci.
export const ALLOWED_STICKERS = [
  '🎲','🃏','♟️','🧩','🎯','🏆','⚔️','🐉','🚀','🌙','🍀','🦊','🐙','🪐','🎩','👑',
  '🤖','🦖','🌴','⛺','🔮','🧲','🎪','🦉','🐝','⭐','🎰','🧸','🛸','🐢','⚡','🏰',
];

export function getProfileStats(userId: number): { plays: number; nights: number; games: number } {
  const db = getDb();
  const one = (sql: string) => Number((db.prepare(sql).get(userId) as { n: number }).n);
  return {
    plays: one('SELECT COUNT(*) AS n FROM picks WHERE spinner_id = ?'),
    nights: one('SELECT COUNT(*) AS n FROM night_players WHERE user_id = ?'),
    games: one('SELECT COUNT(*) AS n FROM games WHERE owner_id = ?'),
  };
}

export function setSticker(userId: number, sticker: unknown): { ok: true } | { error: string; status: number } {
  if (typeof sticker !== 'string' || !ALLOWED_STICKERS.includes(sticker))
    return { error: 'Sticker inconnu', status: 400 };
  getDb().prepare('UPDATE users SET sticker = ?, avatar_path = NULL WHERE id = ?').run(sticker, userId);
  return { ok: true };
}

export function changeCode(userId: number, current: unknown, next: unknown): { ok: true } | { error: string; status: number } {
  const row = getDb().prepare('SELECT code_hash FROM users WHERE id = ?').get(userId) as UserRow | undefined;
  if (!row || !bcrypt.compareSync(String(current ?? ''), row.code_hash))
    return { error: 'Code actuel incorrect', status: 401 };
  const err = validateCode(next);
  if (err) return { error: 'Nouveau code : 4 chiffres', status: 400 };
  getDb().prepare('UPDATE users SET code_hash = ? WHERE id = ?').run(bcrypt.hashSync(next as string, 10), userId);
  return { ok: true };
}

export function deleteAccount(userId: number): { ok: true; removedGames: number } {
  const db = getDb();
  const files: string[] = [];
  const user = db.prepare('SELECT avatar_path FROM users WHERE id = ?').get(userId) as { avatar_path: string | null } | undefined;
  if (user?.avatar_path) files.push(coverPathOnDisk(user.avatar_path));
  for (const c of db.prepare('SELECT cover_path FROM games WHERE owner_id = ?').all(userId) as { cover_path: string | null }[])
    if (c.cover_path) files.push(coverPathOnDisk(c.cover_path));

  const removedGames = Number((db.prepare('SELECT COUNT(*) AS n FROM games WHERE owner_id = ?').get(userId) as { n: number }).n);
  db.transaction(() => {
    // 1) tirages visant MES jeux (RESTRICT sinon) — peu importe qui a fait tourner la roue
    db.prepare('DELETE FROM picks WHERE game_id IN (SELECT id FROM games WHERE owner_id = ?)').run(userId);
    // 2) mes tirages sur les jeux des autres
    db.prepare('DELETE FROM picks WHERE spinner_id = ?').run(userId);
    // 3) mes soirées créées (cascades picks + night_players de ces soirées)
    db.prepare('DELETE FROM nights WHERE creator_id = ?').run(userId);
    // 4) moi (cascades sessions, night_players, games)
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  })();
  for (const f of files) { try { fs.unlinkSync(f); } catch { /* fichier déjà absent */ } }
  return { ok: true, removedGames };
}
