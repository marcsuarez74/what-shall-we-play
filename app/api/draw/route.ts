// app/api/draw/route.ts
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { pickWeightedGameId } from '@/lib/draw';
import { getNight, getShelfGames, userCanAccessNight } from '@/lib/nights';
import { drawAllowed } from '@/lib/nights';
import { getDb } from '@/lib/db';
import { poidsVerdicts } from '@/lib/verdicts';

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  // Corps absent ou avorté (requête coupée en plein vol) → 400 propre, pas de 500 bruyant.
  let body: { nightId?: unknown; gameIds?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Requête invalide' }, { status: 400 }); }
  const { nightId, gameIds } = body;
  const night = getNight(Number(nightId));
  if (!night || !userCanAccessNight(user.id, night.id))
    return NextResponse.json({ error: 'Soirée introuvable' }, { status: 404 });
  const gate = drawAllowed(night.id);
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const shelf = getShelfGames(night.id);
  const allowed = new Set(shelf.map((g) => g.id));
  const ids: number[] = [...new Set((gameIds as number[]).map(Number))].filter((id) => allowed.has(id));
  if (ids.length === 0) return NextResponse.json({ error: 'Sélection vide' }, { status: 400 });
  const poids = poidsVerdicts(ids);
  const gameId = pickWeightedGameId(ids.map((id) => ({ id, poids: poids.get(id) ?? 1 })));
  const info = getDb().prepare('INSERT INTO picks (night_id, game_id, spinner_id) VALUES (?, ?, ?)')
    .run(night.id, gameId, user.id);
  return NextResponse.json({ pickId: Number(info.lastInsertRowid), gameId });
}
