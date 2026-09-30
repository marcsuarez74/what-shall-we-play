// app/api/nights/route.ts
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { createNight, getActiveNight, getNightPlayers } from '@/lib/nights';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const night = getActiveNight(user.id);
  return NextResponse.json({ night: night ? { ...night, players: getNightPlayers(night.id) } : null });
}
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const { playerIds } = await req.json();
  const nightId = createNight(user.id, (playerIds as number[]) ?? []);
  return NextResponse.json({ nightId });
}
