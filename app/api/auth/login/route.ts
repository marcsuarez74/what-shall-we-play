import { NextResponse } from 'next/server';
import { verifyLogin, createSession } from '@/lib/auth';
import { COOKIE_NAME, cookieOpts } from '@/lib/session';

export async function POST(req: Request) {
  const { pseudo, code } = await req.json();
  const res = verifyLogin(pseudo, code);
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, createSession(res.id), cookieOpts());
  return response;
}
