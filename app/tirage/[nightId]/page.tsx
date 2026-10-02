import { notFound, redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { getNight, userCanAccessNight, getShelfGames, getNightPlayers, getNightGame } from '@/lib/nights';
import TirageClient from '@/components/TirageClient';
import UserSync from '@/components/UserSync';

export default async function TiragePage({ params, searchParams }: {
  params: Promise<{ nightId: string }>;
  searchParams: Promise<{ games?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const { nightId } = await params;
  const { games } = await searchParams;
  const night = getNight(Number(nightId));
  if (!night || !userCanAccessNight(user.id, night.id)) notFound();
  // R6 : l'étagère de la soirée, filtrée par la sélection passée dans le query
  const wanted = new Set(
    String(games ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0),
  );
  const selected = getShelfGames(night.id).filter((g) => wanted.has(g.id));
  if (selected.length === 0) redirect('/etagere');
  // Annonce WhatsApp au verdict : qui attend quoi, et l'heure programmée éventuelle
  const waitingPseudos = getNightPlayers(night.id).map((p) => p.pseudo);
  return (
    <>
      <UserSync />
      <TirageClient nightId={night.id} games={selected} waitingPseudos={waitingPseudos}
                    startTime={night.start_time ?? null} status={night.status}
                    partyGame={getNightGame(night.id)}
                    estCreateur={night.creator_id === user.id} />
    </>
  );
}
