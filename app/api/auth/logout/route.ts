import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/session';
import { getDb } from '@/lib/db';
import { supprimerDeviceToken } from '@/lib/auth';

export async function POST(req: Request) {
  // Purge explicite : la session ET le jeton d'appareil s'il est fourni
  // (sinon la restauration silencieuse ramènerait la connexion).
  const { device_token: deviceToken } = await req.json().catch(() => ({})) as Record<string, unknown>;
  if (typeof deviceToken === 'string') supprimerDeviceToken(deviceToken);
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token);
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(COOKIE_NAME);
  return response;
}
