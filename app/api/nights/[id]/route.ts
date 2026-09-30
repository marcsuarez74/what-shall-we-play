// app/api/nights/[id]/route.ts — PATCH { playerIds }
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getNight, setNightPlayers, userCanAccessNight } from '@/lib/nights';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const nightId = Number((await params).id);
  if (!getNight(nightId) || !userCanAccessNight(user.id, nightId))
    return NextResponse.json({ error: 'Soirée introuvable' }, { status: 404 });
  const { playerIds } = await req.json();
  if (!Array.isArray(playerIds) || !playerIds.includes(user.id))
    return NextResponse.json({ error: 'Vous devez être dans la soirée' }, { status: 400 });
  setNightPlayers(nightId, playerIds);
  return NextResponse.json({ ok: true });
}
