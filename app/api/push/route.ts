// app/api/push/route.ts — v4.9.0 : GET { cle, prefs } · POST { subscription } (abonner cet appareil)
// DELETE { endpoint } (désabonner cet appareil) · PATCH { type, actif } (préférence du compte).
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { clesVapid, prefsNotif, abonner, desabonner, reglerNotif } from '@/lib/push';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

async function contexte(req?: Request) {
  const lang = await getLang();
  const user = await getSessionUser();
  const body = req ? ((await req.json().catch(() => ({}))) as Record<string, unknown>) : {};
  return { lang, user, body };
}
const refus = (lang: Awaited<ReturnType<typeof getLang>>, cle: 'erreurs.nonConnecte' | 'erreurs.requeteInvalide', status: number) =>
  NextResponse.json({ error: t(lang, cle) }, { status });

export async function GET() {
  const { lang, user } = await contexte();
  if (!user) return refus(lang, 'erreurs.nonConnecte', 401);
  return NextResponse.json({ cle: clesVapid().publicKey, prefs: prefsNotif(user.id) });
}
export async function POST(req: Request) {
  const { lang, user, body } = await contexte(req);
  if (!user) return refus(lang, 'erreurs.nonConnecte', 401);
  return abonner(user.id, body.subscription) ? NextResponse.json({ ok: true }) : refus(lang, 'erreurs.requeteInvalide', 400);
}
export async function DELETE(req: Request) {
  const { lang, user, body } = await contexte(req);
  if (!user) return refus(lang, 'erreurs.nonConnecte', 401);
  desabonner(user.id, body.endpoint);
  return NextResponse.json({ ok: true });
}
export async function PATCH(req: Request) {
  const { lang, user, body } = await contexte(req);
  if (!user) return refus(lang, 'erreurs.nonConnecte', 401);
  return reglerNotif(user.id, body.type, body.actif) ? NextResponse.json({ ok: true }) : refus(lang, 'erreurs.requeteInvalide', 400);
}
