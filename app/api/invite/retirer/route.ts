// app/api/invite/retirer/route.ts — POST (v4.7.0) : l'invité quitte sa soirée.
// Geste explicite et confirmé côté UI : sa ligne users disparaît (CASCADE sur
// votes, sessions, jetons) — même transaction que le retrait par l'hôte.
import { NextResponse } from 'next/server';
import { getSessionInvite, COOKIE_NAME } from '@/lib/session';
import { getInviteNight, retirerInvite } from '@/lib/nights';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

export async function POST() {
  const lang = await getLang();
  const invite = await getSessionInvite();
  if (!invite) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const night = getInviteNight(invite.id);
  if (!night) return NextResponse.json({ error: t(lang, 'soiree.lienInvalide') }, { status: 404 });
  const r = retirerInvite(night.id, invite.id, invite.id, lang);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(COOKIE_NAME);
  return response;
}
