import { NextResponse } from 'next/server';
import { verifyLogin, createSession, createDeviceToken } from '@/lib/auth';
import { COOKIE_NAME, cookieOpts } from '@/lib/session';
import { getLang, setLangCookie } from '@/lib/i18n/server';
import { t } from '@/lib/i18n';
import { minutesBloquees, noterEchec, effacer } from '@/lib/limite';

// v4.7.2 (audit, point 1) : 5 échecs par pseudo / 20 par IP sur 15 min, puis 429.
// L'IP est la dernière entrée de X-Forwarded-For (ajoutée par le proxy, non falsifiable
// par le client) ; sans en-tête de proxy, seule la limite par pseudo s'applique.
const MAX_PSEUDO = 5;
const MAX_IP = 20;
function ipClient(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',').pop()!.trim() || null;
  return req.headers.get('x-real-ip');
}

export async function POST(req: Request) {
  const lang = await getLang();
  const { pseudo, code, remember } = await req.json().catch(() => ({})) as Record<string, unknown>;
  const clePseudo = `p:${String(pseudo ?? '').trim().toLowerCase()}`;
  const ip = ipClient(req);
  const cleIp = ip ? `ip:${ip}` : null;
  const attente = Math.max(minutesBloquees(clePseudo, MAX_PSEUDO), cleIp ? minutesBloquees(cleIp, MAX_IP) : 0);
  if (attente > 0) return NextResponse.json({ error: t(lang, 'auth.errTropDeTentatives', { min: attente }) }, { status: 429 });
  const res = await verifyLogin(pseudo, code, lang);
  if ('error' in res) {
    noterEchec(clePseudo);
    if (cleIp) noterEchec(cleIp);
    return NextResponse.json({ error: res.error }, { status: res.status });
  }
  effacer(clePseudo);
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
