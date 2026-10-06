import { NextResponse } from 'next/server';
import { verifyLogin, createSession, createDeviceToken } from '@/lib/auth';
import { COOKIE_NAME, cookieOpts } from '@/lib/session';
import { getLang, setLangCookie } from '@/lib/i18n/server';

export async function POST(req: Request) {
  const { pseudo, code, remember } = await req.json().catch(() => ({})) as Record<string, unknown>;
  const res = verifyLogin(pseudo, code, await getLang());
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  // « Se souvenir de moi » (v4.5.0) : cochée par défaut → 1 an (cookie + session)
  // + un jeton d'appareil en secours (les PWA peuvent perdre le cookie).
  const jours = remember === false ? 30 : 365;
  const body: Record<string, unknown> = { ok: true };
  if (remember !== false) body.device_token = createDeviceToken(res.id);
  const response = NextResponse.json(body);
  response.cookies.set(COOKIE_NAME, createSession(res.id, jours), cookieOpts(jours));
  // Seul endroit où le compte influence le navigateur : un compte réglé sur EN
  // amorce le cookie ; un compte FR ne force jamais la langue du navigateur.
  if (res.lang === 'en') setLangCookie(response, 'en');
  return response;
}
