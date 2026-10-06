// app/api/cercles/[id]/membres/route.ts — v4.8.0
// POST { userId } ajouter un ami · PATCH { userId, accepter } valider une arrivée, ou { userId, role } nommer / retirer admin
// DELETE { userId } retirer un membre (admin) — soi-même : quitter le cercle.
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { ajouterMembre, validerMembre, changerRole, retirerMembre, quitterCercle } from '@/lib/cercles';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

type R = { ok: true } | { error: string; status: number };
const json = (r: R) => ('error' in r ? NextResponse.json({ error: r.error }, { status: r.status }) : NextResponse.json(r));

async function contexte(req: Request, params: Promise<{ id: string }>) {
  const lang = await getLang();
  const user = await getSessionUser();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const cercleId = Number((await params).id);
  const valide = Number.isInteger(cercleId) && Number.isInteger(body.userId);
  return { lang, user, body, cercleId, userId: body.userId as number, valide };
}
const refus = (lang: Awaited<ReturnType<typeof getLang>>, connecte: boolean) => connecte
  ? NextResponse.json({ error: t(lang, 'erreurs.requeteInvalide') }, { status: 400 })
  : NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await contexte(req, params);
  if (!c.user || !c.valide) return refus(c.lang, !!c.user);
  return json(ajouterMembre(c.cercleId, c.user.id, c.userId, c.lang));
}
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await contexte(req, params);
  if (!c.user || !c.valide) return refus(c.lang, !!c.user);
  if (c.body.role === 'admin' || c.body.role === 'membre') return json(changerRole(c.cercleId, c.user.id, c.userId, c.body.role, c.lang));
  if (typeof c.body.accepter === 'boolean') return json(validerMembre(c.cercleId, c.user.id, c.userId, c.body.accepter, c.lang));
  return refus(c.lang, true);
}
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await contexte(req, params);
  if (!c.user || !c.valide) return refus(c.lang, !!c.user);
  return json(c.userId === c.user.id ? quitterCercle(c.cercleId, c.user.id, c.lang) : retirerMembre(c.cercleId, c.user.id, c.userId, c.lang));
}
