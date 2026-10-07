// app/api/me/kijoukan/route.ts — v4.16.0 : PUT { grille } — ma semaine type (14 cases '0'/'1').
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { reglerGrille } from '@/lib/kijoukan';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

export async function PUT(req: Request) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { grille?: unknown };
  const r = reglerGrille(user.id, body.grille, lang);
  return 'error' in r ? NextResponse.json({ error: r.error }, { status: r.status }) : NextResponse.json(r);
}
