import { NextResponse } from 'next/server';
import { registerUser, createSession } from '@/lib/auth';
import { COOKIE_NAME, cookieOpts } from '@/lib/session';
import { getLang } from '@/lib/i18n/server';

export async function POST(req: Request) {
  // corps illisible → objet vide → erreur de validation 400 (et non une 500)
  const { pseudo, code, sticker } = await req.json().catch(() => ({})) as Record<string, unknown>;
  const res = registerUser(pseudo, code, sticker, await getLang());
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, createSession(res.id), cookieOpts());
  // Nouveau compte : users.lang = langue de navigation (persistée à la création) ;
  // le compte n'amorce jamais le cookie ici.
  return response;
}
