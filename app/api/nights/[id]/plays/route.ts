// v4.19.0 — choix libre : POST { gameId, manche, score|null } déclare (ou modifie) MA manche,
// DELETE { gameId, manche } la retire. Gabarit de la route veto ; la logique vit dans lib/libre.
import { NextResponse } from 'next/server';
import { getSessionAny } from '@/lib/session';
import { getNight, userCanAccessNight } from '@/lib/nights';
import { declarerManche, retirerDeclaration } from '@/lib/libre';
import { t, type Lang } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

async function lire(req: Request, params: Promise<{ id: string }>, lang: Lang) {
  const user = await getSessionAny();
  if (!user) return { rep: NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 }) };
  const nightId = Number((await params).id);
  if (!Number.isInteger(nightId) || !getNight(nightId) || !userCanAccessNight(user.id, nightId))
    return { rep: NextResponse.json({ error: t(lang, 'erreurs.soireeIntrouvable') }, { status: 404 }) };
  const body = await req.json().catch(() => ({}));
  if (!Number.isInteger(body.gameId))
    return { rep: NextResponse.json({ error: t(lang, 'soiree.errJeuInvalide') }, { status: 400 }) };
  return { user, nightId, body };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const lang = await getLang();
  const r = await lire(req, params, lang);
  if (r.rep) return r.rep;
  const score = r.body.score === null || r.body.score === undefined || r.body.score === '' ? null : Number(r.body.score);
  const res = declarerManche(r.nightId, r.user.id, r.body.gameId, Number(r.body.manche), score, lang);
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const lang = await getLang();
  const r = await lire(req, params, lang);
  if (r.rep) return r.rep;
  const res = retirerDeclaration(r.nightId, r.user.id, r.body.gameId, Number(r.body.manche), lang);
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}
