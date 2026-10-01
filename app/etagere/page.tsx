import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { getActiveNight, getNightPlayers, getShelfGames } from '@/lib/nights';
import { getPickCounts, listUserLibrary } from '@/lib/games';
import NightPicker from '@/components/NightPicker';
import ShelfClient from '@/components/ShelfClient';
import { getDb } from '@/lib/db';
import type { UserLite } from '@/lib/types';

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const users = getDb().prepare('SELECT id, pseudo, sticker, avatar_path FROM users ORDER BY pseudo COLLATE NOCASE').all() as UserLite[];
  const night = getActiveNight(user.id);
  if (!night) {
    // Pas de soirée en cours : on choisit les joueurs présents (créateur pré-coché).
    return <main className="page"><NightPicker users={users} prechecked={[user.id]} /></main>;
  }
  return <main className="page">
    <ShelfClient night={night} players={getNightPlayers(night.id)} games={getShelfGames(night.id)}
                 myLibrary={listUserLibrary(user.id)} users={users}
                 plays={getPickCounts()} me={{ id: user.id, pseudo: user.pseudo, sticker: user.sticker, avatar_path: user.avatar_path }} />
  </main>;
}
