// app/api/nights/[id]/games/route.ts — POST { gameId, added } : ajouter/retirer
// un jeu de l'étagère de la soirée (chacun ajoute depuis sa ludothèque).
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getNight, userCanAccessNight, addNightGame, removeNightGame } from '@/lib/nights';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const nightId = Number((await params).id);
  if (!Number.isInteger(nightId) || !getNight(nightId) || !userCanAccessNight(user.id, nightId))
    return NextResponse.json({ error: 'Soirée introuvable' }, { status: 404 });
  const { gameId, added } = await req.json();
  if (!Number.isInteger(gameId))
    return NextResponse.json({ error: 'Jeu invalide' }, { status: 400 });
  const res = added === false
    ? removeNightGame(nightId, gameId, user.id)
    : addNightGame(nightId, gameId, user.id);
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}
