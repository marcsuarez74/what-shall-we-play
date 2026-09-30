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
// Date calendaire RÉELLE (pas seulement le format) : '2026-10-32' est rejeté.
// Heure bornée : '24:99' est rejeté. Sinon la page QG rendrait Invalid Date (500).
function validIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00`); // midi : immune aux pièges de minuit
  return !Number.isNaN(d.getTime()) && d.toLocaleDateString('sv-SE') === s;
}
function validTime(s: unknown): s is string {
  const m = typeof s === 'string' ? /^(\d{2}):(\d{2})$/.exec(s) : null;
  return !!m && Number(m[1]) < 24 && Number(m[2]) < 60;
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const { playerIds, playedAt, startTime } = await req.json();
  // Programmation facultative : date ISO (aujourd hui ou plus), heure HH:MM.
  // Le créateur est toujours ajouté à la nuit par createNight.
  if (playedAt != null) {
    if (!validIsoDate(playedAt)) return NextResponse.json({ error: 'Date invalide' }, { status: 400 });
    const today = new Date().toLocaleDateString('sv-SE');
    if (playedAt < today) return NextResponse.json({ error: 'La date ne peut pas être dans le passé' }, { status: 400 });
  }
  if (startTime != null && !validTime(startTime)) {
    return NextResponse.json({ error: 'Heure invalide' }, { status: 400 });
  }
  const nightId = createNight(user.id, (playerIds as number[]) ?? [], { playedAt, startTime });
  return NextResponse.json({ nightId });
}
