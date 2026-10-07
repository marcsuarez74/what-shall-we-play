// v4.13.0 — POST { gameId } : pose ou retire le veto ❌ du joueur connecté (un par partie).
// Gabarit de la route games : gardes de session et d'accès, la logique vit dans lib/nights.
import { NextResponse } from 'next/server';
import { getSessionAny } from '@/lib/session';
import { getNight, userCanAccessNight, toggleNightVeto } from '@/lib/nights';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const lang = await getLang();
  const user = await getSessionAny(); // l'invité vetoe aussi (sa soirée seulement : userCanAccessNight)
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const nightId = Number((await params).id);
  if (!Number.isInteger(nightId) || !getNight(nightId) || !userCanAccessNight(user.id, nightId))
    return NextResponse.json({ error: t(lang, 'erreurs.soireeIntrouvable') }, { status: 404 });
  const { gameId } = await req.json();
  if (!Number.isInteger(gameId))
    return NextResponse.json({ error: t(lang, 'soiree.errJeuInvalide') }, { status: 400 });
  const res = toggleNightVeto(nightId, gameId, user.id, lang);
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}
