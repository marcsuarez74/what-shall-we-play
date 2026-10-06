import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { getActiveNight, getNightPlayers, getShelfGames, getNightGame, getTodayTermineeNight, getShelfVotes, getShelfNight, estFuture, lienInvitation } from '@/lib/nights';
import { getPickCounts, listUserLibrary } from '@/lib/games';
import { listComptes } from '@/lib/users';
import NightPicker from '@/components/NightPicker';
import ShelfClient from '@/components/ShelfClient';
import TermineeCard from '@/components/TermineeCard';
import UserMenu from '@/components/UserMenu';
import UserSync from '@/components/UserSync';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// v4.7.0 — ?night=<id> ouvre l'étagère d'une partie précise (programmée : on
// prépare les jeux à l'avance). Sans paramètre, ou partie inaccessible : « ce soir ».
// Un invité n'arrive jamais ici (getSessionUser le refuse : sa page est /invite).
export default async function Page({ searchParams }: { searchParams: Promise<{ night?: string }> }) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const users = listComptes();
  const demande = Number((await searchParams).night);
  const night = (Number.isInteger(demande) ? getShelfNight(user.id, demande) : null) ?? getActiveNight(user.id);
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
                 futur={estFuture(night)}
                 lien={night.creator_id === user.id ? lienInvitation(night) : undefined}
                 me={{ id: user.id, pseudo: user.pseudo, sticker: user.sticker, avatar_path: user.avatar_path }} />
  </main>;
}
