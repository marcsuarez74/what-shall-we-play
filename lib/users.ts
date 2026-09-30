import { getDb } from './db';
import bcrypt from 'bcryptjs';
import { validateCode } from './auth';
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
