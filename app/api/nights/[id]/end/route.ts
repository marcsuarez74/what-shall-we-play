// app/api/nights/[id]/end/route.ts — POST : terminer la soirée en cours (créateur seulement)
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getNight, endNight } from '@/lib/nights';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const night = getNight(Number((await params).id));
  if (!night) return NextResponse.json({ error: 'Soirée introuvable' }, { status: 404 });
  if (night.creator_id !== user.id) {
    return NextResponse.json({ error: 'Seul le créateur peut terminer la soirée' }, { status: 403 });
  }
  endNight(night.id, user.id);
  return NextResponse.json({ ok: true });
}
