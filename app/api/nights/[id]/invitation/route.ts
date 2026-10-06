// app/api/nights/[id]/invitation/route.ts — v4.8.0 : POST { reponse: 'dispo' | 'absent' } (l'invité répond)
// ou { userId } (l'organisateur inscrit lui-même un invité).
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { repondre, inscrire } from '@/lib/invitations';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const nightId = Number((await params).id);
  const body = (await req.json().catch(() => ({}))) as { reponse?: unknown; userId?: unknown };
  const r = Number.isInteger(body.userId)
    ? inscrire(nightId, user.id, body.userId as number, lang)
    : repondre(nightId, user.id, body.reponse, lang);
  return 'error' in r ? NextResponse.json({ error: r.error }, { status: r.status }) : NextResponse.json(r);
}
