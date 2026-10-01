// app/api/nights/[id]/validate/route.ts — POST : « je valide ma sélection ».
// Signal, pas verrou : l'ajout/retrait d'une boîte l'annule (cf. lib/nights).
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { validateSelection } from '@/lib/nights';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const nightId = Number((await params).id);
  try {
    validateSelection(nightId, user.id);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
