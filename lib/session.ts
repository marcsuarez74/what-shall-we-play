import { cookies } from 'next/headers';
import { getUserByToken } from './auth';
import type { UserRow } from './types';

export const COOKIE_NAME = 'wsp_session';
export function cookieOpts(jours = 30) {
  // v4.7.2 (audit, point 3) : Secure en production — le cookie ne circule qu'en HTTPS.
  // (En dev / E2E, localhost est en HTTP : le flag empêcherait toute connexion.)
  return { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * jours, path: '/' };
}
// Toute session, compte ou invité — réservé aux routes qu'un invité a le droit
// d'utiliser (vote, sync live, langue, retrait, conversion en compte).
export async function getSessionAny(): Promise<UserRow | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  return token ? getUserByToken(token) : null;
}
// v4.7.0 : un invité n'est pas un utilisateur de l'app — refus par défaut. Toutes
// les pages et routes existantes le voient « non connecté » ; seule sa soirée
// (/invite) et quelques routes passent par getSessionAny / getSessionInvite.
export async function getSessionUser(): Promise<UserRow | null> {
  const u = await getSessionAny();
  return u && !u.est_invite ? u : null;
}
export async function getSessionInvite(): Promise<UserRow | null> {
  const u = await getSessionAny();
  return u?.est_invite ? u : null;
}
