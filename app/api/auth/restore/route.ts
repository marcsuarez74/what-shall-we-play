// Restauration silencieuse d'appareil (v4.5.0) : les PWA peuvent perdre leur
// cookie à la mort de l'app ; le jeton gardé en localStorage rétablit la session.
// Le jeton est à usage unique (rotation) : chaque restauration en rend un neuf.
import { NextResponse } from 'next/server';
import { COOKIE_NAME, cookieOpts } from '@/lib/session';
import { consommerDeviceToken, createSession } from '@/lib/auth';

export async function POST(req: Request) {
  const { token } = await req.json().catch(() => ({})) as Record<string, unknown>;
  if (typeof token !== 'string') return NextResponse.json({ error: 'jeton manquant' }, { status: 401 });
  const r = consommerDeviceToken(token);
  if (!r) return NextResponse.json({ error: 'jeton inconnu' }, { status: 401 });
  const response = NextResponse.json({ ok: true, device_token: r.deviceToken });
  response.cookies.set(COOKIE_NAME, createSession(r.userId, 365), cookieOpts(365));
  return response;
}
