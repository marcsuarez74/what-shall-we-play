import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { getDb } from './db';
import { t, type Lang } from './i18n';
import { ALLOWED_STICKERS } from './stickers';
import type { UserRow } from './types';

// lang : langue du navigateur (cookie) passée par les routes auth — défaut 'fr',
// le comportement historique (les tests unitaires restent en français).
// À la création, elle est persistée dans users.lang (« la langue suit le compte »).
export type AuthResult = { id: number; lang?: string } | { error: string; status: number };

export function validatePseudo(p: unknown, lang: Lang = 'fr'): string | null {
  if (typeof p !== 'string' || !/^[A-Za-z0-9_-]{3,20}$/.test(p)) return t(lang, 'auth.errPseudo');
  return null;
}
export function validateCode(c: unknown, lang: Lang = 'fr'): string | null {
  if (typeof c !== 'string' || !/^[0-9]{4}$/.test(c)) return t(lang, 'auth.errCode');
  return null;
}

export function registerUser(pseudo: unknown, code: unknown, sticker?: unknown, lang: Lang = 'fr'): AuthResult {
  const pe = validatePseudo(pseudo, lang); if (pe) return { error: pe, status: 400 };
  const ce = validateCode(code, lang); if (ce) return { error: ce, status: 400 };
  // Avatar d'onboarding : un emoji de la grille validée, sinon le dé par défaut.
  const st = sticker == null || sticker === '' ? null : sticker;
  if (st != null && !(ALLOWED_STICKERS as readonly string[]).includes(st as string))
    return { error: t(lang, 'auth.errEmoji'), status: 400 };
  const hash = bcrypt.hashSync(code as string, 10);
  try {
    const info = st != null
      ? getDb().prepare('INSERT INTO users (pseudo, code_hash, sticker, lang) VALUES (?, ?, ?, ?)').run(pseudo, hash, st, lang)
      : getDb().prepare('INSERT INTO users (pseudo, code_hash, lang) VALUES (?, ?, ?)').run(pseudo, hash, lang);
    return { id: Number(info.lastInsertRowid) };
  } catch (e: unknown) {
    if (String(e).includes('UNIQUE')) return { error: t(lang, 'auth.errPseudoPris'), status: 409 };
    throw e;
  }
}

export function verifyLogin(pseudo: unknown, code: unknown, lang: Lang = 'fr'): AuthResult {
  const row = getDb().prepare('SELECT * FROM users WHERE pseudo = ?').get(pseudo) as UserRow | undefined;
  if (!row || !bcrypt.compareSync(String(code ?? ''), row.code_hash))
    return { error: t(lang, 'auth.errIdentifiants'), status: 401 };
  return { id: row.id, lang: row.lang };
}

export function createSession(userId: number): string {
  const token = crypto.randomBytes(32).toString('hex');
  getDb().prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now','+30 days'))`).run(token, userId);
  return token;
}

export function getUserByToken(token: string): UserRow | null {
  const row = getDb().prepare(`
    SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now')`).get(token) as UserRow | undefined;
  return row ?? null;
}
