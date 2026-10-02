// POST : la boîte sort — la partie démarre (n'importe quel joueur de la soirée).
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { boxOutNight } from '@/lib/nights';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const { gameId } = await req.json();
  const res = boxOutNight(Number((await params).id), user.id, Number(gameId));
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}
