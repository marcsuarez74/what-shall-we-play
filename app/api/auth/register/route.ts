import { NextResponse } from 'next/server';
import { registerUser, createSession } from '@/lib/auth';
import { COOKIE_NAME, cookieOpts } from '@/lib/session';
import { getLang } from '@/lib/i18n/server';

export async function POST(req: Request) {
  const { pseudo, code, sticker } = await req.json();
  const res = registerUser(pseudo, code, sticker, await getLang());
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, createSession(res.id), cookieOpts());
  // Nouveau compte : users.lang = 'fr' par défaut → le compte n'amorce jamais le cookie ici.
  return response;
}
