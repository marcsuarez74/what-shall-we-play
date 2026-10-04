// app/api/foyers/members/route.ts — POST { userId } : le créateur retire un membre
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getUserFoyerId, removeMember } from '@/lib/foyers';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

export async function POST(req: Request) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const { userId } = await req.json();
  if (!Number.isInteger(userId)) return NextResponse.json({ error: t(lang, 'foyer.errMembreInvalide') }, { status: 400 });
  const myFoyerId = getUserFoyerId(user.id);
  if (!myFoyerId) return NextResponse.json({ error: t(lang, 'foyer.errPasDeFoyer') }, { status: 404 });
  const res = removeMember(myFoyerId, userId, user.id, lang);
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}
