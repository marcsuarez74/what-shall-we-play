import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { getDb } from './db';
import type { UserRow } from './types';

export type AuthResult = { id: number } | { error: string; status: number };

export function validatePseudo(p: unknown): string | null {
  if (typeof p !== 'string' || !/^[A-Za-z0-9_-]{3,20}$/.test(p)) return 'Pseudo : 3 à 20 caractères (lettres, chiffres, _ -)';
  return null;
}
export function validateCode(c: unknown): string | null {
  if (typeof c !== 'string' || !/^[0-9]{4}$/.test(c)) return 'Code secret : 4 chiffres';
  return null;
}

export function registerUser(pseudo: unknown, code: unknown): AuthResult {
  const pe = validatePseudo(pseudo); if (pe) return { error: pe, status: 400 };
  const ce = validateCode(code); if (ce) return { error: ce, status: 400 };
  const hash = bcrypt.hashSync(code as string, 10);
  try {
    const info = getDb().prepare('INSERT INTO users (pseudo, code_hash) VALUES (?, ?)').run(pseudo, hash);
    return { id: Number(info.lastInsertRowid) };
  } catch (e: unknown) {
    if (String(e).includes('UNIQUE')) return { error: 'Pseudo déjà pris', status: 409 };
    throw e;
  }
}

export function verifyLogin(pseudo: unknown, code: unknown): AuthResult {
  const row = getDb().prepare('SELECT * FROM users WHERE pseudo = ?').get(pseudo) as UserRow | undefined;
  if (!row || !bcrypt.compareSync(String(code ?? ''), row.code_hash))
    return { error: 'Identifiants incorrects', status: 401 };
  return { id: row.id };
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
