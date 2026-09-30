import { getDb } from './db';

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
