import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { changeCode } from '@/lib/users';

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const { current, next } = await req.json();
  const r = changeCode(user.id, current, next);
  if (!('ok' in r)) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}
