// app/api/series/[id]/dispo/route.ts — v4.14.0 : POST « Dispo à toutes » les dates à venir.
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { dispoATous } from '@/lib/series';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const r = dispoATous(Number((await params).id), user.id, lang);
  return 'error' in r ? NextResponse.json({ error: r.error }, { status: r.status }) : NextResponse.json(r);
}
