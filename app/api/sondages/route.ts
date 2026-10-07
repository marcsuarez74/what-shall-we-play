// app/api/sondages/route.ts — v4.10.0 : POST { titre?, dates: [{ playedAt, startTime? }], playerIds, cercleIds? } → { id }
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { creerSondage } from '@/lib/sondages';
import { viaCercles } from '@/lib/cercles';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

export async function POST(req: Request) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const r = creerSondage(user.id, { titre: body.titre, dates: body.dates, playerIds: body.playerIds, via: viaCercles(user.id, body.cercleIds) }, lang);
  return 'error' in r ? NextResponse.json({ error: r.error }, { status: r.status }) : NextResponse.json(r);
}
