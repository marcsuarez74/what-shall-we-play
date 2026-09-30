import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { listMyGames } from '@/lib/games';
import LibraryClient from '@/components/LibraryClient';
export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return <main className="page"><LibraryClient games={listMyGames(user.id)} /></main>;
}
