import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { getNight, getNightPlayers, getNightGame, getNightScores } from '@/lib/nights';
import ScoreCarnet from '@/components/ScoreCarnet';

// Le carnet des scores : écran plein, créateur seulement, partie en jeu.
// Un non-créateur ou une soirée dans un autre état n'y accède jamais.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const night = getNight(Number((await params).id));
  if (!night || night.creator_id !== user.id) redirect('/nights');
  if (night.status === 'creation') redirect(`/tirage/${night.id}`);
  if (night.status !== 'en_jeu') redirect(`/nights/${night.id}`);
  const game = getNightGame(night.id);
  if (!game) redirect('/nights');
  return <main className="page score-page">
    <ScoreCarnet nightId={night.id} game={game} players={getNightPlayers(night.id)}
                 dejaSaisis={getNightScores(night.id)} />
  </main>;
}
