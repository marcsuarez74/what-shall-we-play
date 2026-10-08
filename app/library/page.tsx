import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { listUserLibrary, getPickCounts } from '@/lib/games';
import { verdictsParJeu } from '@/lib/verdicts';
import { getFoyerForUser } from '@/lib/foyers';
import LibraryClient from '@/components/LibraryClient';
export default async function Page({ searchParams }: { searchParams: Promise<{ bienvenue?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const { bienvenue } = await searchParams;
  const foyer = getFoyerForUser(user.id);
  return <main className="page">
    <LibraryClient games={listUserLibrary(user.id)} plays={getPickCounts()} verdicts={verdictsParJeu()}
                   me={user} bienvenue={bienvenue === '1'}
                   foyer={foyer ? { name: foyer.name, members: foyer.members.length } : null} />
  </main>;
}
