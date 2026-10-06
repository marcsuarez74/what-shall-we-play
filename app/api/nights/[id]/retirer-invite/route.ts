// app/api/nights/[id]/retirer-invite/route.ts — POST { inviteId } (v4.6.0).
// Geste explicite de l'hôte : la ligne users de l'invité disparaît (CASCADE
// sur players/votes/scores/verdicts/sessions).
import { NextResponse } from 'next/server';
import { retirerInvite } from '@/lib/nights';
import { getSessionUser } from '@/lib/session';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const nightId = Number((await params).id);
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const inviteId = Number(body.inviteId);
  if (!Number.isInteger(nightId) || !Number.isInteger(inviteId))
    return NextResponse.json({ error: t(lang, 'erreurs.requeteInvalide') }, { status: 400 });
  const r = retirerInvite(nightId, inviteId, user.id, lang);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}
