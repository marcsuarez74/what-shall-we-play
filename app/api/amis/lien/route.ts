// app/api/amis/lien/route.ts — v4.8.0 : POST { k } — ouvrir le lien d'ami de quelqu'un rend amis.
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { rejoindreParLienAmi } from '@/lib/amis';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

export async function POST(req: Request) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const { k } = (await req.json().catch(() => ({}))) as { k?: unknown };
  const r = rejoindreParLienAmi(user.id, k, lang);
  return 'error' in r ? NextResponse.json({ error: r.error }, { status: r.status }) : NextResponse.json(r);
}
