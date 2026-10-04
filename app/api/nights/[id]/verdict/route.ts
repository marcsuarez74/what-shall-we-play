// POST { verdict } : le verdict 😍🙂😐 du joueur connecté sur la boîte de la soirée terminée.
// Gabarit de la route votes : gardes de session et d'accès, la logique vit dans lib/verdicts.
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getNight, userCanAccessNight } from '@/lib/nights';
import { poserVerdict, type Verdict } from '@/lib/verdicts';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const nightId = Number((await params).id);
  if (!Number.isInteger(nightId) || !getNight(nightId) || !userCanAccessNight(user.id, nightId))
    return NextResponse.json({ error: 'Soirée introuvable' }, { status: 404 });
  const { verdict } = await req.json();
  const res = poserVerdict(nightId, user.id, verdict as Verdict);
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}
