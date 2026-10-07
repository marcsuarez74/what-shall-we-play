// app/invite/page.tsx — la soirée de l'invité (v4.7.0), et rien d'autre : date,
// organisateur, joueurs, étagère avec votes, puis jeu sorti et résultat en lecture
// seule. Pas d'onglets ni de profil : toute autre page le renvoie ici (login).
import { redirect } from 'next/navigation';
import { getSessionInvite } from '@/lib/session';
import { getInviteNight, getNightPlayers, getShelfGames, getShelfVotes, getShelfVetos, getNightGame, getNightScores } from '@/lib/nights';
import { rankScores } from '@/lib/ranks';
import { getPickCounts } from '@/lib/games';
import { getDb } from '@/lib/db';
import { t } from '@/lib/i18n';
import { formatDate, titrePartie } from '@/lib/i18n/format';
import { getLang } from '@/lib/i18n/server';
import type { UserLite } from '@/lib/types';
import UserSync from '@/components/UserSync';
import InviteSoiree from '@/components/InviteSoiree';

export default async function Page() {
  const lang = await getLang();
  const me = await getSessionInvite();
  if (!me) redirect('/login');
  const night = getInviteNight(me.id);
  if (!night) return <main className="join-page"><p className="join-erreur">{t(lang, 'soiree.lienInvalide')}</p></main>;
  const hote = getDb().prepare('SELECT id, pseudo, sticker, avatar_path FROM users WHERE id = ?').get(night.creator_id) as UserLite;
  const classement = night.status === 'termine'
    ? rankScores(getNightScores(night.id)).sort((a, b) => a.rank - b.rank).map((s) => ({ pseudo: s.pseudo, score: s.score, rank: s.rank }))
    : [];
  return (
    <main className="page invite-page">
      <UserSync />
      <InviteSoiree
        night={{ id: night.id, status: night.status }}
        titre={titrePartie(lang, night)}
        dateLong={formatDate(lang, `${night.played_at}T12:00:00`, { weekday: 'long', day: 'numeric', month: 'long' })}
        time={night.start_time ? formatDate(lang, `${night.played_at}T${night.start_time}`, { timeStyle: 'short' }) : null}
        hote={hote} players={getNightPlayers(night.id)} games={getShelfGames(night.id)} votes={getShelfVotes(night.id)} vetos={getShelfVetos(night.id)}
        partyGame={getNightGame(night.id)} plays={getPickCounts()} classement={classement}
        me={{ id: me.id, pseudo: me.pseudo }} />
    </main>
  );
}
