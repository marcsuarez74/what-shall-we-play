// app/api/cercles/route.ts — v4.8.0 : POST { nom } → { id } (le créateur en est admin).
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { creerCercle } from '@/lib/cercles';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

export async function POST(req: Request) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const { nom } = (await req.json().catch(() => ({}))) as { nom?: unknown };
  const r = creerCercle(user.id, nom, lang);
  return 'error' in r ? NextResponse.json({ error: r.error }, { status: r.status }) : NextResponse.json(r);
}
