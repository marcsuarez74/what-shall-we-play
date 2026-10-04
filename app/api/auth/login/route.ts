import { NextResponse } from 'next/server';
import { verifyLogin, createSession } from '@/lib/auth';
import { COOKIE_NAME, cookieOpts } from '@/lib/session';
import { getLang, setLangCookie } from '@/lib/i18n/server';

export async function POST(req: Request) {
  const { pseudo, code } = await req.json();
  const res = verifyLogin(pseudo, code, await getLang());
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, createSession(res.id), cookieOpts());
  // Seul endroit où le compte influence le navigateur : un compte réglé sur EN
  // amorce le cookie ; un compte FR ne force jamais la langue du navigateur.
  if (res.lang === 'en') setLangCookie(response, 'en');
  return response;
}
