import { cookies } from 'next/headers';
import { getUserByToken } from './auth';
import type { UserRow } from './types';

export const COOKIE_NAME = 'wsp_session';
export function cookieOpts() {
  return { httpOnly: true, sameSite: 'lax' as const, maxAge: 60 * 60 * 24 * 30, path: '/' };
}
export async function getSessionUser(): Promise<UserRow | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  return token ? getUserByToken(token) : null;
}
