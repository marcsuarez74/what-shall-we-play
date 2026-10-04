// app/api/nights/[id]/route.ts — PATCH : nuit en préparation { playerIds } (v1, QG) ;
// nuit terminée : correction partielle { playedAt?, gameId?, playerIds?, scores? } (v4.2.0).
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getNight, corrigerNuit, setNightPlayers, userCanAccessNight, type NuitPatch } from '@/lib/nights';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const nightId = Number((await params).id);
  const night = getNight(nightId);
  if (!night || !userCanAccessNight(user.id, nightId))
    return NextResponse.json({ error: t(lang, 'erreurs.soireeIntrouvable') }, { status: 404 });
  const body = await req.json();
  if (night.status !== 'termine') {
    // Comportement v1 conservé : le QG ne change que les joueurs d'une nuit en préparation.
    const { playerIds } = body;
    if (!Array.isArray(playerIds) || !playerIds.includes(user.id))
      return NextResponse.json({ error: t(lang, 'soiree.errDoitEtreDansSoiree') }, { status: 400 });
    setNightPlayers(nightId, playerIds);
    return NextResponse.json({ ok: true });
  }
  const patch: NuitPatch = {};
  if (body.playedAt !== undefined) patch.playedAt = body.playedAt;
  if (body.gameId !== undefined) patch.gameId = Number(body.gameId);
  if (body.playerIds !== undefined) patch.playerIds = body.playerIds.map(Number);
  if (body.scores !== undefined) patch.scores = body.scores;
  const res = corrigerNuit(nightId, user.id, patch, lang);
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}
