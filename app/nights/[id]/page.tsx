import { notFound, redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { getNight, userCanAccessNight, getNightGame, getNightScores } from '@/lib/nights';
import { rankScores } from '@/lib/ranks';
import { avatarSrc } from '@/lib/formats';
import BoxImage from '@/components/BoxImage';
import PartagerResultats from '@/components/PartagerResultats';

// Le détail d'une soirée terminée : héros (cover + titre + date), badge « Terminée »,
// podium (1ʳᵉ carte bordée cuivre, rangs 2/3 en duo, autres en lignes) et partage.
// Visible des joueurs de la soirée seulement (userCanAccessNight — pattern existant).
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const night = getNight(Number((await params).id));
  if (!night || !userCanAccessNight(user.id, night.id)) notFound();
  const game = getNightGame(night.id);
  const scores = getNightScores(night.id);
  const classe = rankScores(scores);
  const un = classe.filter((c) => c.rank === 1), deux = classe.filter((c) => c.rank === 2), trois = classe.filter((c) => c.rank === 3);
  const autres = classe.filter((c) => c.rank > 3);
  const Av = ({ u }: { u: { pseudo: string; sticker: string | null; avatar_path: string | null } }) =>
    avatarSrc(u) ? <img className="avs" src={avatarSrc(u)!} alt="" /> : <span className="avs">{u.sticker ?? '🎲'}</span>;
  return (
    <main className="page detail-page">
      <a className="retour-btn" href="/nights">← Parties</a>
      <div className="dt-hero">
        {game && <span className="cov dt-cov"><BoxImage game={game} /></span>}
        <div><h3>{game?.title ?? 'Soirée de jeux'}</h3>
          <p>{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(`${night.played_at}T12:00:00`))} · {classe.length} joueurs</p></div>
      </div>
      <span className="badge-etat b-term"><span className="pt" />Terminée</span>
      {classe.length === 0 ? (
        <p className="sans-score">Pas de scores ce soir — la partie est dans les annales.</p>
      ) : (
        <>
          <p className="pod-lb">LE PODIUM</p>
          <div className="pod1"><Av u={un[0]} /><span className="pd"><b>{un.map((x) => x.pseudo).join(' & ')}</b><span>👑 première place</span></span><span className="sc">{un[0].score}</span></div>
          {(deux.length > 0 || trois.length > 0) && (
            <div className="pod23">
              {deux.map((x) => <div key={x.user_id} className="p"><Av u={x} /><div><b>{x.pseudo}</b><span>🥈 {x.score} pts</span></div></div>)}
              {trois.map((x) => <div key={x.user_id} className="p"><Av u={x} /><div><b>{x.pseudo}</b><span>🥉 {x.score} pts</span></div></div>)}
            </div>
          )}
          {autres.length > 0 && (
            <div className="pod-autres">
              {autres.map((x) => <div key={x.user_id}><span className="avs avs-sm">{x.sticker ?? '🎲'}</span><span>{x.pseudo}</span><span className="sc">{x.score}</span></div>)}
            </div>
          )}
        </>
      )}
      <PartagerResultats titre={game?.title ?? 'Soirée de jeux'} classement={classe.map((c) => ({ pseudo: c.pseudo, score: c.score as number, rank: c.rank }))} />
    </main>
  );
}
