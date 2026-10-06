// app/api/cercles/rejoindre/route.ts — v4.8.0 : POST { k } → membre (adhésion libre) ou en attente (validation).
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { rejoindreParLien } from '@/lib/cercles';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

export async function POST(req: Request) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const { k } = (await req.json().catch(() => ({}))) as { k?: unknown };
  const r = rejoindreParLien(user.id, k, lang);
  return 'error' in r ? NextResponse.json({ error: r.error }, { status: r.status }) : NextResponse.json(r);
}
