// app/api/games/[id]/lier/route.ts — v4.24.0 : « Lier à BGG » depuis la fiche d'un jeu de la ludothèque.
// Corps : { bggId }. La fiche BGG (et sa pochette) remplace les infos ; titre et format restent.
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { getThing, attachCover } from '@/lib/bgg';
import { getGame, canManageGame, lierJeu } from '@/lib/games';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const id = Number((await params).id);
  const g = getGame(id);
  if (!g || !canManageGame(user.id, g)) return NextResponse.json({ error: t(lang, 'jeu.errIntrouvable') }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const bggId = Number(b.bggId);
  if (!Number.isInteger(bggId) || bggId <= 0) return NextResponse.json({ error: t(lang, 'bgg.errPasReponse') }, { status: 400 });
  const thing = await getThing(bggId);
  if (!thing) return NextResponse.json({ error: t(lang, 'bgg.errPasReponse') }, { status: 502 });
  const res = lierJeu(user.id, id, await attachCover(thing), lang);
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ game: getGame(id) });
}
