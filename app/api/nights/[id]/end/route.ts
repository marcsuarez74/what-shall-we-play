// POST : terminer la soirée (créateur seulement). Corps optionnel { scores } :
// le carnet des scores enregistre et termine en un seul appel atomique.
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getNight, endNight } from '@/lib/nights';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const night = getNight(Number((await params).id));
  if (!night) return NextResponse.json({ error: 'Soirée introuvable' }, { status: 404 });
  let scores: Record<string, number> | undefined;
  try {
    const body = await req.json();
    if (body && typeof body === 'object' && body.scores && typeof body.scores === 'object') scores = body.scores;
  } catch { /* sans corps : abandon d'une soirée en préparation */ }
  const res = endNight(night.id, user.id, scores);
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}
