// app/api/nights/route.ts
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { createNight, getActiveNight, getNightPlayers, validerPlanning, normaliserTitre } from '@/lib/nights';
import { refuserInvite } from '@/lib/auth';
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
  const nightId = createNight(user.id, (playerIds as number[]) ?? [], { playedAt, startTime, titre });
  return NextResponse.json({ nightId });
}
