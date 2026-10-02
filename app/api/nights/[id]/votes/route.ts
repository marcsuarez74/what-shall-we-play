// POST { gameId } : bascule le 👍 du joueur connecté sur une boîte de l'étagère.
// Gabarit de la route games : gardes de session et d'accès, la logique vit dans lib/nights.
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getNight, userCanAccessNight, toggleNightVote } from '@/lib/nights';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const nightId = Number((await params).id);
  if (!Number.isInteger(nightId) || !getNight(nightId) || !userCanAccessNight(user.id, nightId))
    return NextResponse.json({ error: 'Soirée introuvable' }, { status: 404 });
  const { gameId } = await req.json();
  if (!Number.isInteger(gameId))
    return NextResponse.json({ error: 'Jeu invalide' }, { status: 400 });
  const res = toggleNightVote(nightId, gameId, user.id);
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}
