// app/api/sondages/[id]/reponse/route.ts — v4.10.0 : POST { dateId, dispo } (l'invité coche ou décoche une date).
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { repondreSondage } from '@/lib/sondages';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { dateId?: unknown; dispo?: unknown };
  const r = repondreSondage(Number((await params).id), user.id, body.dateId, body.dispo, lang);
  return 'error' in r ? NextResponse.json({ error: r.error }, { status: r.status }) : NextResponse.json(r);
}
