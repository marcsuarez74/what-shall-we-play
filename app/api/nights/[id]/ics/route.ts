// app/api/nights/[id]/ics/route.ts — v4.11.0 : GET → fichier calendrier (.ics) d'une partie
// programmée. Réservé à ceux qui y jouent (créateur, joueurs, invités par lien).
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { estFuture, getNight, getNightPlayers, userCanAccessNight } from '@/lib/nights';
import { genererIcs, nomFichierIcs } from '@/lib/ics';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { titrePartie } from '@/lib/i18n/format';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const nightId = Number((await params).id);
  const night = Number.isInteger(nightId) ? getNight(nightId) : null;
  // Partie inconnue OU inaccessible : même 404, on ne révèle rien.
  if (!night || !userCanAccessNight(user.id, nightId)) {
    return NextResponse.json({ error: t(lang, 'erreurs.soireeIntrouvable') }, { status: 404 });
  }
  if (night.status === 'termine' || !estFuture(night)) {
    return NextResponse.json({ error: t(lang, 'soiree.errIcsPasProgrammee') }, { status: 409 });
  }
  const base = process.env.PUBLIC_URL || 'https://what-shall-we-play.marco-studio.fr';
  const titre = titrePartie(lang, night);
  const ics = genererIcs({
    id: night.id,
    titre,
    playedAt: night.played_at,
    startTime: night.start_time ?? null,
    joueurs: getNightPlayers(night.id).map((p) => p.pseudo),
    // Jamais le lien d'invitation (il ouvre la partie) : l'étagère exige d'être connecté.
    url: `${base}/etagere?night=${night.id}`,
    lang,
  });
  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nomFichierIcs(titre)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
