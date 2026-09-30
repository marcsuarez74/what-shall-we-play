import { NextResponse } from 'next/server';
import { getSessionUser, cookieOpts, COOKIE_NAME } from '@/lib/session';
import { getProfileStats, setSticker, deleteAccount } from '@/lib/users';
import { verifyLogin } from '@/lib/auth';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  return NextResponse.json({
    id: user.id, pseudo: user.pseudo, sticker: user.sticker ?? '🎲', avatar_path: user.avatar_path ?? null,
    stats: getProfileStats(user.id),
  });
}

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const { sticker } = await req.json();
  const r = setSticker(user.id, sticker);
  if (!('ok' in r)) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const { code } = await req.json();
  const check = verifyLogin(user.pseudo, code);
  if ('error' in check) return NextResponse.json({ error: 'Code incorrect' }, { status: 401 });
  deleteAccount(user.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, '', { ...cookieOpts(), maxAge: 0 });
  return res;
}
