import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { searchBoardgames } from '@/lib/bgg';

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const q = new URL(req.url).searchParams.get('q')?.trim();
  if (!q || q.length < 2) return NextResponse.json({ results: [] });
  try {
    return NextResponse.json({ results: await searchBoardgames(q) });
  } catch {
    return NextResponse.json({ error: 'Recherche BGG indisponible, saisie manuelle toujours possible' }, { status: 502 });
  }
}
