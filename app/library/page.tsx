import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { listMyGames, getPickCounts } from '@/lib/games';
import { getActiveNight, getExcludedGameIds } from '@/lib/nights';
import LibraryClient from '@/components/LibraryClient';
export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const night = getActiveNight(user.id);
  return <main className="page">
    <LibraryClient games={listMyGames(user.id)} plays={getPickCounts()}
                   activeNightId={night?.id ?? null} excludedIds={night ? getExcludedGameIds(night.id) : []} />
  </main>;
}
