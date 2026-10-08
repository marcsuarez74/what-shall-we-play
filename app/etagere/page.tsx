import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { getActiveNight, getNightPlayers, getShelfGames, getNightGame, getTodayTermineeNight, getShelfVotes, getShelfVetos, getShelfNight, estFuture, lienInvitation } from '@/lib/nights';
import { mesEvenements } from '@/lib/evenements';
import { getNightPlays } from '@/lib/libre';
import { getPickCounts, listUserLibrary } from '@/lib/games';
import { listRelations } from '@/lib/amis';
import { mesCercles, membresCercle } from '@/lib/cercles';
import NightPicker from '@/components/NightPicker';
import ShelfClient from '@/components/ShelfClient';
import TermineeCard from '@/components/TermineeCard';
import UserMenu from '@/components/UserMenu';
import UserSync from '@/components/UserSync';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import type { UserLite } from '@/lib/types';

// v4.8.0 — les joueurs déjà dans la partie restent proposés (décochables), même hors de mes relations.
function avecJoueurs(relations: UserLite[], joueurs: UserLite[], moi: number): UserLite[] {
  const autres = joueurs.filter((j) => !j.est_invite && j.id !== moi && !relations.some((r) => r.id === j.id));
  return [...relations, ...autres];
}

// v4.7.0 — ?night=<id> ouvre l'étagère d'une partie précise (programmée : on
// prépare les jeux à l'avance). Sans paramètre, ou partie inaccessible : « ce soir ».
// Un invité n'arrive jamais ici (getSessionUser le refuse : sa page est /invite).
export default async function Page({ searchParams }: { searchParams: Promise<{ night?: string }> }) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) redirect('/login');
  // v4.8.0 : seulement mes amis et mon foyer (plus tous les comptes).
  const moi = { id: user.id, pseudo: user.pseudo, sticker: user.sticker, avatar_path: user.avatar_path };
  const users = [moi, ...listRelations(user.id)];
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
      <NightPicker users={users} prechecked={[user.id]} meId={user.id} evenements={mesEvenements(user.id).map((e) => ({ id: e.id, titre: e.titre }))} cercles={mesCercles(user.id).map((c) => ({
        id: c.id, nom: c.nom, membres: membresCercle(c.id).filter((m) => m.etat === 'membre').map((m) => m.id),
      }))} />
    </main>;
  }
  return <main className="page">
    <UserSync />
    <ShelfClient night={night} partyGame={getNightGame(night.id)} players={getNightPlayers(night.id)} games={getShelfGames(night.id)}
                 myLibrary={listUserLibrary(user.id)} users={avecJoueurs(users, getNightPlayers(night.id), user.id)}
                 plays={getPickCounts()} votes={getShelfVotes(night.id)} vetos={getShelfVetos(night.id)}
                 declarations={night.mode === 'libre' ? getNightPlays(night.id) : []}
                 evenements={mesEvenements(user.id).map((e) => ({ id: e.id, titre: e.titre }))}
                 futur={estFuture(night)}
                 lien={night.creator_id === user.id ? lienInvitation(night) : undefined}
                 me={{ id: user.id, pseudo: user.pseudo, sticker: user.sticker, avatar_path: user.avatar_path }} />
  </main>;
}
