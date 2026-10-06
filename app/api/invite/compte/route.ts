// app/api/invite/compte/route.ts — POST { pseudo, code } (v4.7.0) : l'invité
// devient un compte. Même ligne users : sa soirée, ses votes et sa session restent.
import { NextResponse } from 'next/server';
import { getSessionInvite } from '@/lib/session';
import { convertirInvite } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

export async function POST(req: Request) {
  const lang = await getLang();
  const invite = await getSessionInvite();
  if (!invite) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const r = convertirInvite(invite.id, body.pseudo, body.code, lang);
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}
