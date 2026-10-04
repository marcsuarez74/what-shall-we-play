// app/api/nights/retro/route.ts — POST : créer une partie passée en un geste (v4.2.0).
// Corps { playedAt, gameId, playerIds, scores? } — l'auteur devient créateur ;
// la partie naît directement 'termine' avec le jeu posé.
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { creerNuitRetro } from '@/lib/nights';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

export async function POST(req: Request) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const body = await req.json();
  const res = creerNuitRetro(user.id, {
    playedAt: body.playedAt,
    gameId: Number(body.gameId),
    playerIds: Array.isArray(body.playerIds) ? body.playerIds.map(Number) : [],
    scores: body.scores && typeof body.scores === 'object' ? body.scores : undefined,
  }, lang);
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true, nightId: res.nightId });
}
