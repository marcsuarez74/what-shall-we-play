// app/api/nights/[id]/excludes/route.ts — POST { gameId, excluded } « Pas ce soir »
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getNight, userCanAccessNight, isGameOnShelf, excludeGame, restoreGame } from '@/lib/nights';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const nightId = Number((await params).id);
  if (!Number.isInteger(nightId) || !getNight(nightId) || !userCanAccessNight(user.id, nightId))
    return NextResponse.json({ error: 'Soirée introuvable' }, { status: 404 });
  const { gameId, excluded } = await req.json();
  if (!Number.isInteger(gameId))
    return NextResponse.json({ error: 'Jeu invalide' }, { status: 400 });
  if (!isGameOnShelf(nightId, gameId))
    return NextResponse.json({ error: 'Jeu hors étagère' }, { status: 400 });
  if (excluded) excludeGame(nightId, gameId);
  else restoreGame(nightId, gameId);
  return NextResponse.json({ ok: true });
}
