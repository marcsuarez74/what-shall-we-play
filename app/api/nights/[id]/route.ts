// app/api/nights/[id]/route.ts — PATCH { playerIds?, titre?, playedAt?, startTime? } (nuit non terminée) /
// correction partielle { playedAt?, gameId?, playerIds?, scores? } (terminée, v4.2.0) · DELETE (supprimer).
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getNight, corrigerNuit, supprimerNuit, setNightPlayers, userCanAccessNight, modifierInfosNuit, normaliserTitre, validerPlanning, estFuture, getNightPlayers, type NuitPatch } from '@/lib/nights';
import { filtrerJoueurs, inviter, oublierInvitations } from '@/lib/invitations';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const nightId = Number((await params).id);
  const night = getNight(nightId);
  if (!night || !userCanAccessNight(user.id, nightId))
    return NextResponse.json({ error: t(lang, 'erreurs.soireeIntrouvable') }, { status: 404 });
  const body = await req.json();
  if (night.status !== 'termine') {
    // v4.7.0 : titre, date, heure (créateur) — chacun facultatif, validé avant toute écriture.
    const infos = body.titre !== undefined || body.playedAt !== undefined || body.startTime !== undefined;
    const titre = normaliserTitre(body.titre);
    if (titre === false) return NextResponse.json({ error: t(lang, 'soiree.errTitre') }, { status: 400 });
    const erreur = validerPlanning(body.playedAt, body.startTime, lang);
    if (erreur) return NextResponse.json({ error: erreur }, { status: 400 });
    // Comportement v1 conservé : les joueurs d'une nuit en préparation (playerIds facultatif depuis v4.7.0).
    const { playerIds } = body;
    if (playerIds !== undefined && (!Array.isArray(playerIds) || !playerIds.includes(user.id)))
      return NextResponse.json({ error: t(lang, 'soiree.errDoitEtreDansSoiree') }, { status: 400 });
    if (infos) {
      const res = modifierInfosNuit(nightId, user.id, {
        titre, playedAt: body.playedAt ?? undefined, startTime: body.startTime,
      }, lang);
      if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
    }
    if (playerIds !== undefined) {
      // v4.8.0 : les joueurs en place restent possibles, les nouveaux doivent m'être liés ;
      // sur une partie programmée, un nouveau est invité (il répond Dispo / Pas dispo).
      const avant = getNightPlayers(nightId).map((p) => p.id);
      const garde = filtrerJoueurs(user.id, playerIds, avant);
      if (estFuture(getNight(nightId)!)) {
        oublierInvitations(nightId, avant.filter((id) => !garde.includes(id)));
        setNightPlayers(nightId, garde.filter((id) => avant.includes(id)));
        inviter(nightId, user.id, garde.filter((id) => !avant.includes(id)));
      } else setNightPlayers(nightId, garde);
    }
    return NextResponse.json({ ok: true });
  }
  // Corps malformé → 400 propre (même classe que la branche v1 au-dessus), jamais un 500.
  if (body.playerIds !== undefined && !Array.isArray(body.playerIds))
    return NextResponse.json({ error: t(lang, 'erreurs.requeteInvalide') }, { status: 400 });
  if (body.scores !== undefined && (!body.scores || typeof body.scores !== 'object'))
    return NextResponse.json({ error: t(lang, 'erreurs.requeteInvalide') }, { status: 400 });
  const patch: NuitPatch = {};
  if (body.playedAt !== undefined) patch.playedAt = body.playedAt;
  if (body.gameId !== undefined) patch.gameId = Number(body.gameId);
  if (body.playerIds !== undefined) patch.playerIds = body.playerIds.map(Number);
  if (body.scores !== undefined) patch.scores = body.scores;
  const res = corrigerNuit(nightId, user.id, patch, lang);
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const nightId = Number((await params).id);
  const res = supprimerNuit(nightId, user.id, lang);
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}
