// app/api/bgg/collection/route.ts — lecture seule de la collection possédée (own=1).
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { collectionUtilisateur } from '@/lib/bgg';

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const username = new URL(req.url).searchParams.get('username') ?? '';
  const r = await collectionUtilisateur(username);
  // Union non discriminée ({ ok: true } | { error, status }) : resserrement via 'in',
  // même motif que app/api/games/[id]/enrichir/route.ts.
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ jeux: r.jeux });
}
