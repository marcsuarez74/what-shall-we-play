// app/api/foyers/dedupe/route.ts — POST résoudre un doublon : la fiche conservée
// absorbe l'historique de l'autre (picks, écartés), qui disparaît.
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { resolveDupe } from '@/lib/foyers';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

export async function POST(req: Request) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const body = await req.json() as { keepId?: number; removeId?: number };
  const keepId = Number(body.keepId); const removeId = Number(body.removeId);
  if (!Number.isInteger(keepId) || !Number.isInteger(removeId))
    return NextResponse.json({ error: t(lang, 'foyer.errChoixInvalide') }, { status: 400 });
  try {
    resolveDupe(keepId, removeId, lang);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
