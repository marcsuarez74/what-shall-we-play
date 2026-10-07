// app/api/evenements/[id]/jeux/route.ts — v4.15.0 : POST { gameId, actif } ajoute ou retire un
// jeu « Au programme » (organisateur, jeu de sa ludothèque).
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { ajouterJeuProgramme, retirerJeuProgramme } from '@/lib/evenements';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { gameId?: unknown; actif?: unknown };
  if (!Number.isInteger(body.gameId)) return NextResponse.json({ error: t(lang, 'soiree.errJeuInvalide') }, { status: 400 });
  const evtId = Number((await params).id);
  const r = body.actif === false
    ? retirerJeuProgramme(evtId, user.id, body.gameId as number, lang)
    : ajouterJeuProgramme(evtId, user.id, body.gameId as number, lang);
  return 'error' in r ? NextResponse.json({ error: r.error }, { status: r.status }) : NextResponse.json(r);
}
