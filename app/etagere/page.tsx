import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { getActiveNight, getNightPlayers, getShelfGames, getNightGame, getTodayTermineeNight, getShelfVotes } from '@/lib/nights';
import { getPickCounts, listUserLibrary } from '@/lib/games';
import NightPicker from '@/components/NightPicker';
import ShelfClient from '@/components/ShelfClient';
import TermineeCard from '@/components/TermineeCard';
import UserMenu from '@/components/UserMenu';
import UserSync from '@/components/UserSync';
import { getDb } from '@/lib/db';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import type { UserLite } from '@/lib/types';

export default async function Page() {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const users = getDb().prepare('SELECT id, pseudo, sticker, avatar_path FROM users ORDER BY pseudo COLLATE NOCASE').all() as UserLite[];
  const night = getActiveNight(user.id);
  if (!night) {
    // Pas de partie en cours : on choisit les joueurs présents (créateur pré-coché).
    // Si la soirée du jour est terminée, on l'affiche au-dessus du picker.
    const terminee = getTodayTermineeNight(user.id);
    return <main className="page">
      <UserSync />
      <div className="page-head">
        <h1>{t(lang, 'etagere.titre')}</h1>
        <UserMenu me={user} />
      </div>
      {terminee && <TermineeCard nightId={terminee.id} gameTitle={terminee.game_title} lang={lang} />}
      <NightPicker users={users} prechecked={[user.id]} />
    </main>;
  }
  return <main className="page">
    <UserSync />
    <ShelfClient night={night} partyGame={getNightGame(night.id)} players={getNightPlayers(night.id)} games={getShelfGames(night.id)}
                 myLibrary={listUserLibrary(user.id)} users={users}
                 plays={getPickCounts()} votes={getShelfVotes(night.id)}
                 me={{ id: user.id, pseudo: user.pseudo, sticker: user.sticker, avatar_path: user.avatar_path }} />
  </main>;
}
