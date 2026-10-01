import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { listUserLibrary, getPickCounts } from '@/lib/games';
import { getFoyerForUser } from '@/lib/foyers';
import LibraryClient from '@/components/LibraryClient';
export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const foyer = getFoyerForUser(user.id);
  return <main className="page">
    <LibraryClient games={listUserLibrary(user.id)} plays={getPickCounts()}
                   foyer={foyer ? { name: foyer.name, members: foyer.members.length } : null} />
  </main>;
}
