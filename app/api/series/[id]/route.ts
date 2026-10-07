// app/api/series/[id]/route.ts — v4.14.0 : PATCH { titre?, startTime? } modifie toutes les
// dates à venir de la série ; DELETE l'arrête (dates vierges supprimées, préparées gardées).
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { normaliserTitre, validerPlanning } from '@/lib/nights';
import { arreterSerie, modifierSerie } from '@/lib/series';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { titre?: unknown; startTime?: unknown };
  const titre = normaliserTitre(body.titre);
  if (titre === false) return NextResponse.json({ error: t(lang, 'soiree.errTitre') }, { status: 400 });
  const startTime = body.startTime === undefined ? undefined : body.startTime === '' ? null : body.startTime;
  const erreur = validerPlanning(null, startTime ?? null, lang);
  if (erreur) return NextResponse.json({ error: erreur }, { status: 400 });
  const r = modifierSerie(Number((await params).id), user.id, { titre, startTime: startTime as string | null | undefined }, lang);
  return 'error' in r ? NextResponse.json({ error: r.error }, { status: r.status }) : NextResponse.json(r);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const r = arreterSerie(Number((await params).id), user.id, lang);
  return 'error' in r ? NextResponse.json({ error: r.error }, { status: r.status }) : NextResponse.json(r);
}
