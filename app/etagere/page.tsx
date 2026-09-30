import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { getCurrentNight, getNightPlayers, getShelfGames } from '@/lib/nights';
import NightPicker from '@/components/NightPicker';
import ShelfClient from '@/components/ShelfClient';
import { getDb } from '@/lib/db';
import type { UserLite } from '@/lib/types';

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const users = getDb().prepare('SELECT id, pseudo FROM users ORDER BY pseudo COLLATE NOCASE').all() as UserLite[];
  const night = getCurrentNight(user.id);
  if (!night) {
    // Pas de soirée en cours : on choisit les joueurs présents (créateur pré-coché).
    return <main className="page"><NightPicker users={users} prechecked={[user.id]} /></main>;
  }
  return <main className="page">
    <ShelfClient night={night} players={getNightPlayers(night.id)} games={getShelfGames(night.id)} users={users} />
  </main>;
}
