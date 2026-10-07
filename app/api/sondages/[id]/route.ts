// app/api/sondages/[id]/route.ts — v4.10.0 : DELETE (l'organisateur supprime le sondage, confirmé côté UI).
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { supprimerSondage } from '@/lib/sondages';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const r = supprimerSondage(Number((await params).id), user.id, lang);
  return 'error' in r ? NextResponse.json({ error: r.error }, { status: r.status }) : NextResponse.json(r);
}
