import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getThing, attachCover } from '@/lib/bgg';

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'id invalide' }, { status: 400 });
  const thing = await getThing(id);
  if (!thing) return NextResponse.json({ error: 'Fiche BGG indisponible' }, { status: 502 });
  return NextResponse.json(await attachCover(thing));
}
