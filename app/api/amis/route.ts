// app/api/amis/route.ts — v4.8.0 : POST { pseudo } (demande) · PATCH { userId, accepter } · DELETE { userId } (retirer, confirmé côté UI)
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { demanderAmi, repondreDemande, retirerAmi } from '@/lib/amis';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

type R = { ok: true } | { error: string; status: number };
const json = (r: R) => ('error' in r ? NextResponse.json({ error: r.error }, { status: r.status }) : NextResponse.json(r));

async function contexte(req: Request) {
  const lang = await getLang();
  const user = await getSessionUser();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return { lang, user, body };
}

export async function POST(req: Request) {
  const { lang, user, body } = await contexte(req);
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  return json(demanderAmi(user.id, body.pseudo, lang));
}
export async function PATCH(req: Request) {
  const { lang, user, body } = await contexte(req);
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  if (!Number.isInteger(body.userId)) return NextResponse.json({ error: t(lang, 'erreurs.requeteInvalide') }, { status: 400 });
  return json(repondreDemande(user.id, body.userId as number, body.accepter === true, lang));
}
export async function DELETE(req: Request) {
  const { lang, user, body } = await contexte(req);
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  if (!Number.isInteger(body.userId)) return NextResponse.json({ error: t(lang, 'erreurs.requeteInvalide') }, { status: 400 });
  return json(retirerAmi(user.id, body.userId as number));
}
