// app/api/cercles/[id]/route.ts — v4.8.0 (admins) : PATCH { nom?, adhesion? } · DELETE (supprimer, confirmé côté UI).
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { modifierCercle, supprimerCercle } from '@/lib/cercles';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

type R = { ok: true } | { error: string; status: number };
const json = (r: R) => ('error' in r ? NextResponse.json({ error: r.error }, { status: r.status }) : NextResponse.json(r));

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { nom?: unknown; adhesion?: unknown };
  return json(modifierCercle(Number((await params).id), user.id, body, lang));
}
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  return json(supprimerCercle(Number((await params).id), user.id, lang));
}
