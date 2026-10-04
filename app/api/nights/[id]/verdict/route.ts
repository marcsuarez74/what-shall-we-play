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
  // Corps absent ou avorté (requête coupée en plein vol) → 400 propre, pas de 500 bruyant.
  let body: { verdict?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Requête invalide' }, { status: 400 }); }
  const { verdict } = body;
  const res = poserVerdict(nightId, user.id, verdict as Verdict);
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}
