import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionUser } from '@/lib/session';
import { getNight, userCanAccessNight, getNightGame, getNightScores, getNightPlayers, getNightPicks } from '@/lib/nights';
import { listUserLibrary, getGame } from '@/lib/games';
import { getFoyerForUser } from '@/lib/foyers';
import { rankScores } from '@/lib/ranks';
import { avatarSrc } from '@/lib/formats';
import { t } from '@/lib/i18n';
import { formatDate } from '@/lib/i18n/format';
import { getLang } from '@/lib/i18n/server';
import BoxImage from '@/components/BoxImage';
import PartagerResultats from '@/components/PartagerResultats';
import VerdictBloc from '@/components/VerdictBloc';
import CorrigerPartie from '@/components/CorrigerPartie';
import UserSync from '@/components/UserSync';
import { verdictsDeNuit, monVerdict } from '@/lib/verdicts';

// Le détail d'une soirée terminée : héros (cover + titre + date), badge « Terminée »,
// podium (1ʳᵉ carte bordée cuivre, rangs 2/3 en duo, autres en lignes), verdict du
// jeu 😍🙂😐 et partage. UserSync : les compteurs des autres rafraîchissent en direct.
// Visible des joueurs de la soirée seulement (userCanAccessNight — pattern existant).
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const night = getNight(Number((await params).id));
  if (!night || !userCanAccessNight(user.id, night.id)) notFound();
  const game = getNightGame(night.id);
  const scores = getNightScores(night.id);
  const joueurs = getNightPlayers(night.id);
  const nbTirages = getNightPicks(night.id).length;
  const jeux = listUserLibrary(user.id);
  if (night.game_id && !jeux.some((g) => g.id === night.game_id)) {
    const jeuActuel = getGame(night.game_id);
    if (jeuActuel) jeux.push(jeuActuel);
  }
  const membres = getFoyerForUser(user.id)?.members ?? [];
  const classe = rankScores(scores);
  const un = classe.filter((c) => c.rank === 1), deux = classe.filter((c) => c.rank === 2), trois = classe.filter((c) => c.rank === 3);
  const autres = classe.filter((c) => c.rank > 3);
  const Av = ({ u }: { u: { pseudo: string; sticker: string | null; avatar_path: string | null } }) =>
    avatarSrc(u) ? <img className="avs" src={avatarSrc(u)!} alt="" /> : <span className="avs">{u.sticker ?? '🎲'}</span>;
  return (
    <main className="page detail-page">
      <UserSync />
      <Link className="retour-btn" href="/nights">{t(lang, 'soiree.retour')}</Link>
      <div className="dt-hero">
        {game && <span className="cov dt-cov"><BoxImage game={game} /></span>}
        <div><h3>{game?.title ?? t(lang, 'soiree.sansJeu')}</h3>
          <p>{formatDate(lang, `${night.played_at}T12:00:00`, { dateStyle: 'long' })} · {t(lang, 'etagere.nbJoueurs', { n: classe.length })}</p></div>
      </div>
      <span className="badge-etat b-term"><span className="pt" />{t(lang, 'etagere.terminee')}</span>
      {classe.length === 0 ? (
        <p className="sans-score">{t(lang, 'soiree.sansScores')}</p>
      ) : (
        <>
          <p className="pod-lb">{t(lang, 'soiree.podium')}</p>
          <div className="pod1"><Av u={un[0]} /><span className="pd"><b>{un.map((x) => x.pseudo).join(' & ')}</b><span>{t(lang, 'soiree.premierePlace')}</span></span><span className="sc">{un[0].score}</span></div>
          {(deux.length > 0 || trois.length > 0) && (
            <div className="pod23">
              {deux.map((x) => <div key={x.user_id} className="p"><Av u={x} /><div><b>{x.pseudo}</b><span>{t(lang, 'soiree.argent', { s: x.score as number })}</span></div></div>)}
              {trois.map((x) => <div key={x.user_id} className="p"><Av u={x} /><div><b>{x.pseudo}</b><span>{t(lang, 'soiree.bronze', { s: x.score as number })}</span></div></div>)}
            </div>
          )}
          {autres.length > 0 && (
            <div className="pod-autres">
              {autres.map((x) => <div key={x.user_id}><span className="avs avs-sm">{x.sticker ?? '🎲'}</span><span>{x.pseudo}</span><span className="sc">{x.score}</span></div>)}
            </div>
          )}
        </>
      )}
      {night.status === 'termine' && game && (
        <VerdictBloc nightId={night.id} titreJeu={game.title}
          initial={monVerdict(night.id, user.id)} compteurs={verdictsDeNuit(night.id)} />
      )}
      {night.status === 'termine' && (
        <CorrigerPartie nightId={night.id} playedAt={night.played_at} gameId={night.game_id ?? null}
          titreJeu={game?.title ?? null} joueurs={joueurs} candidats={membres} scores={scores} jeux={jeux}
          compteurs={verdictsDeNuit(night.id)} nbTirages={nbTirages} />
      )}
      <PartagerResultats titre={game?.title ?? t(lang, 'soiree.sansJeu')} classement={classe.map((c) => ({ pseudo: c.pseudo, score: c.score as number, rank: c.rank }))} />
    </main>
  );
}
