// app/api/evenements/route.ts — v4.15.0 : POST { titre, description?, du?, au?, playerIds?, cercleIds? }
// crée un événement ; les participants (amis cochés + membres des cercles cochés) le voient.
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { creerEvenement } from '@/lib/evenements';
import { viaCercles } from '@/lib/cercles';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

export async function POST(req: Request) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const ids = [...(Array.isArray(body.playerIds) ? body.playerIds : []), ...viaCercles(user.id, body.cercleIds).keys()];
  const r = creerEvenement(user.id, { titre: body.titre, description: body.description, du: body.du, au: body.au }, ids, lang);
  return typeof r === 'number' ? NextResponse.json({ id: r }) : NextResponse.json({ error: r.error }, { status: r.status });
}
