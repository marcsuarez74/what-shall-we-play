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
  // v4.5.0 : trim côté serveur aussi ; caractères spéciaux limités à @ ! _ (v4.5.0,
  // demande client — le tiret historique disparaît, aucun pseudo existant affecté).
  if (typeof p !== 'string' || !/^[A-Za-z0-9@!_]{3,20}$/.test(p.trim())) return t(lang, 'auth.errPseudo');
  return null;
}
export function validateCode(c: unknown, lang: Lang = 'fr'): string | null {
  if (typeof c !== 'string' || !/^[0-9]{4}$/.test(c)) return t(lang, 'auth.errCode');
  return null;
}

export function registerUser(pseudo: unknown, code: unknown, sticker?: unknown, lang: Lang = 'fr'): AuthResult {
  const p = typeof pseudo === 'string' ? pseudo.trim() : pseudo;
  const pe = validatePseudo(p, lang); if (pe) return { error: pe, status: 400 };
  const ce = validateCode(code, lang); if (ce) return { error: ce, status: 400 };
  // Avatar d'onboarding : un emoji de la grille validée, sinon le dé par défaut.
  const st = sticker == null || sticker === '' ? null : sticker;
  if (st != null && !(ALLOWED_STICKERS as readonly string[]).includes(st as string))
    return { error: t(lang, 'auth.errEmoji'), status: 400 };
  const hash = bcrypt.hashSync(code as string, 10);
  try {
    const info = st != null
      ? getDb().prepare('INSERT INTO users (pseudo, code_hash, sticker, lang) VALUES (?, ?, ?, ?)').run(p, hash, st, lang)
      : getDb().prepare('INSERT INTO users (pseudo, code_hash, lang) VALUES (?, ?, ?)').run(p, hash, lang);
    return { id: Number(info.lastInsertRowid) };
  } catch (e: unknown) {
    if (String(e).includes('UNIQUE')) return { error: t(lang, 'auth.errPseudoPris'), status: 409 };
    throw e;
  }
}

// v4.6.0 (invités par lien) : l'invité est une ligne users non connectable —
// code_hash = bcrypt d'un aléatoire (jamais deviné), pseudo = nom choisi par
// l'hôte (exempt du charset d'inscription), suffixé si collision.
export function creerInvite(nom: unknown, hostId: number, lang: Lang = 'fr'): AuthResult {
  const n = typeof nom === 'string' ? nom.trim().replace(/\s+/g, ' ') : '';
  if (n.length < 1 || n.length > 20) return { error: t(lang, 'auth.errNomInvite'), status: 400 };
  const base = n;
  let pseudo = base;
  for (let i = 2; getDb().prepare('SELECT 1 FROM users WHERE pseudo = ?').get(pseudo); i++) pseudo = `${base} ${i}`;
  const codeHash = bcrypt.hashSync(crypto.randomBytes(18).toString('hex'), 10);
  const info = getDb()
    .prepare('INSERT INTO users (pseudo, code_hash, lang, est_invite, host_id) VALUES (?, ?, ?, 1, ?)')
    .run(pseudo, codeHash, 'fr', hostId);
  return { id: Number(info.lastInsertRowid) };
}

// v4.6.0 : un invité reste mécanique de soirée — il ne crée pas de ressources
// (soirée, foyer). Une seule garde, appelée par les routes de création.
export function refuserInvite(user: Pick<UserRow, 'est_invite'> | null | undefined, lang: Lang = 'fr'): { error: string; status: number } | null {
  if (user?.est_invite) return { error: t(lang, 'auth.errInviteCreation'), status: 403 };
  return null;
}

export function verifyLogin(pseudo: unknown, code: unknown, lang: Lang = 'fr'): AuthResult {
  // trim : un espace copié-collé ne doit pas faire échouer la connexion
  const p = typeof pseudo === 'string' ? pseudo.trim() : pseudo;
  const row = getDb().prepare('SELECT * FROM users WHERE pseudo = ?').get(p) as UserRow | undefined;
  if (row?.est_invite) return { error: t(lang, 'auth.errInvite'), status: 401 }; // un invité ne se connecte pas
  if (!row || !bcrypt.compareSync(String(code ?? ''), row.code_hash))
    return { error: t(lang, 'auth.errIdentifiants'), status: 401 };
  return { id: row.id, lang: row.lang };
}

export function createSession(userId: number, jours = 30): string {
  const token = crypto.randomBytes(32).toString('hex');
  getDb().prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now','+${jours} days'))`).run(token, userId);
  return token;
}

// « Se souvenir de moi » (v4.5.0) : un jeton d'appareil longue durée complète le
// cookie — les PWA peuvent perdre le cookie à la mort de l'app (constaté Android),
// le localStorage survit. Rotation à chaque restauration (un jeton usagé meurt).
export function createDeviceToken(userId: number): string {
  const token = crypto.randomBytes(32).toString('hex');
  getDb().prepare('INSERT INTO device_tokens (token, user_id) VALUES (?, ?)').run(token, userId);
  return token;
}

export function consommerDeviceToken(token: string): { userId: number; deviceToken: string } | null {
  const row = getDb().prepare('SELECT user_id FROM device_tokens WHERE token = ?').get(token) as
    { user_id: number } | undefined;
  if (!row) return null;
  getDb().prepare('DELETE FROM device_tokens WHERE token = ?').run(token);
  return { userId: row.user_id, deviceToken: createDeviceToken(row.user_id) };
}

export function supprimerDeviceToken(token: string): void {
  getDb().prepare('DELETE FROM device_tokens WHERE token = ?').run(token);
}

export function getUserByToken(token: string): UserRow | null {
  const row = getDb().prepare(`
    SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now')`).get(token) as UserRow | undefined;
  return row ?? null;
}
