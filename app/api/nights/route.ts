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
  const { playerIds, playedAt, startTime } = await req.json();
  // Programmation facultative : date ISO (aujourd hui ou plus), heure HH:MM.
  // Le créateur est toujours ajouté à la nuit par createNight.
  if (playedAt != null) {
    if (typeof playedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(playedAt)) {
      return NextResponse.json({ error: 'Date invalide' }, { status: 400 });
    }
    const today = new Date().toLocaleDateString('sv-SE');
    if (playedAt < today) return NextResponse.json({ error: 'La date ne peut pas être dans le passé' }, { status: 400 });
  }
  if (startTime != null && (typeof startTime !== 'string' || !/^\d{2}:\d{2}$/.test(startTime))) {
    return NextResponse.json({ error: 'Heure invalide' }, { status: 400 });
  }
  const nightId = createNight(user.id, (playerIds as number[]) ?? [], { playedAt, startTime });
  return NextResponse.json({ nightId });
}
