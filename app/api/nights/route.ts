// app/api/nights/route.ts
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { createNight, getActiveNight, getNightPlayers, validerPlanning, normaliserTitre, estFuture } from '@/lib/nights';
import { filtrerJoueurs, inviter } from '@/lib/invitations';
import { viaCercles } from '@/lib/cercles';
import { refuserInvite } from '@/lib/auth';
import { creerSerie } from '@/lib/series';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

export async function GET() {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const night = getActiveNight(user.id);
  return NextResponse.json({ night: night ? { ...night, players: getNightPlayers(night.id) } : null });
}
export async function POST(req: Request) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { playerIds, playedAt, startTime } = body as { playerIds?: number[]; playedAt?: string; startTime?: string | null };
  // Programmation facultative : date ISO (aujourd hui ou plus), heure HH:MM, titre (v4.7.0).
  // Le créateur est toujours ajouté à la nuit par createNight.
  const erreur = validerPlanning(playedAt, startTime, lang);
  if (erreur) return NextResponse.json({ error: erreur }, { status: 400 });
  const titre = normaliserTitre(body.titre);
  if (titre === false) return NextResponse.json({ error: t(lang, 'soiree.errTitre') }, { status: 400 });
  const garde = refuserInvite(user, lang);
  if (garde) return NextResponse.json({ error: garde.error }, { status: garde.status }); // un invité ne crée pas de soirée
  const ids = Array.isArray(playerIds) ? playerIds : [];
  // v4.8.0 : une partie programmée invite (Dispo → joueur) ; celle du jour inscrit directement.
  // Seules mes relations (et les membres de mes cercles) peuvent y être mises.
  if (playedAt && estFuture({ played_at: playedAt })) {
    // v4.14.0 : « Répéter » — chaque semaine (1) ou toutes les 2 semaines (2).
    if (body.repeter === 1 || body.repeter === 2) {
      const serieId = creerSerie(user.id, { playedAt, startTime: startTime ?? null, titre: titre ?? null, pas: body.repeter }, ids, viaCercles(user.id, body.cercleIds));
      return NextResponse.json({ serieId });
    }
    const nightId = createNight(user.id, [user.id], { playedAt, startTime, titre });
    inviter(nightId, user.id, ids, viaCercles(user.id, body.cercleIds));
    return NextResponse.json({ nightId });
  }
  const nightId = createNight(user.id, filtrerJoueurs(user.id, ids), { playedAt, startTime, titre });
  return NextResponse.json({ nightId });
}
