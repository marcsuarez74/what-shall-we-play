import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { getActiveNight, getPlannedNights, getHistoryCards, getNightPlayers, getNightGame } from '@/lib/nights';
import { coverSrc } from '@/lib/formats';
import { getDb } from '@/lib/db';
import type { UserLite } from '@/lib/types';
import PlayerChip from '@/components/PlayerChip';
import NightPlanner from '@/components/NightPlanner';
import InviteButton from '@/components/InviteButton';
import TerminerNight from '@/components/TerminerNight';
import UserMenu from '@/components/UserMenu';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' });
const timeFormat = new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short' });
const monthFormat = new Intl.DateTimeFormat('fr-FR', { month: 'short' });

// « 2026-10-02 » → jour « 2 » + mois « oct. » — la date est le héros d'une carte programmée.
function dayMonth(playedAt: string): { day: string; month: string } {
  return {
    day: String(Number(playedAt.split('-')[2])),
    month: monthFormat.format(new Date(`${playedAt}T12:00:00`)).replace('.', ''),
  };
}

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const active = getActiveNight(user.id);
  const planned = getPlannedNights(user.id);
  // Historique : une carte par partie terminée (gagnant 👑 · score, date) → détail.
  const cartes = getHistoryCards(user.id);
  // Le jeu de la partie (boîte sortie) — les picks cumulés ne s'affichent plus (v3.3.0).
  const activeGame = active?.game_id ? getNightGame(active.id) : null;
  const users = getDb().prepare('SELECT id, pseudo, sticker, avatar_path FROM users ORDER BY pseudo COLLATE NOCASE').all() as UserLite[];

  return (
    <main className="page">
      <div className="page-head">
        <h1>Mes parties</h1>
        <UserMenu me={user} />
      </div>

      <section className="qg-section" aria-label="Ce soir">
        <h2>Ce soir</h2>
        {active ? (
          <ul className="nights-list">
            <li className="night-card live">
              <div className="night-card-head">
                {active.status === 'en_jeu'
                  ? <span className="badge-etat b-enjeu"><span className="pt" />En jeu</span>
                  : <span className="badge-etat b-prep"><span className="pt" />En préparation</span>}
                {active.creator_id === user.id && <TerminerNight nightId={active.id} status={active.status} />}
              </div>
              <div className="chips">
                {getNightPlayers(active.id).map((p) => <PlayerChip key={p.id} u={p} />)}
              </div>
              {activeGame && <p className="jeu-partie">🎯 {activeGame.title} — jeu de la partie</p>}
            </li>
          </ul>
        ) : (
          <p className="empty">Pas de partie aujourd&apos;hui — programmez-la ou lancez-la <a href="/etagere">depuis l&apos;étagère</a>.</p>
        )}
      </section>

      <section className="qg-section" aria-label="Programmées">
        <div className="qg-head">
          <h2>Programmées</h2>
          <NightPlanner users={users} meId={user.id} />
        </div>
        {planned.length === 0 ? (
          <p className="empty">Aucune partie programmée — la prochaine commence ici.</p>
        ) : (
          <ul className="nights-list">
            {planned.map((n) => {
              const players = getNightPlayers(n.id);
              const { day, month } = dayMonth(n.played_at);
              return (
                <li key={n.id} className="night-card planned-card">
                  <div className="plan-date" aria-hidden="true">
                    <span className="plan-day">{day}</span>
                    <span className="plan-month">{month}</span>
                  </div>
                  <div className="plan-body">
                    <div className="plan-when">
                      <span className="plan-long">{dateFormat.format(new Date(`${n.played_at}T12:00:00`))}</span>
                      {n.start_time && (
                        <span className="plan-time">{timeFormat.format(new Date(`${n.played_at}T${n.start_time}`))}</span>
                      )}
                    </div>
                    <div className="chips">
                      {players.map((p) => <PlayerChip key={p.id} u={p} />)}
                    </div>
                    <InviteButton
                      dateLong={dateFormat.format(new Date(`${n.played_at}T12:00:00`))}
                      time={n.start_time ? timeFormat.format(new Date(`${n.played_at}T${n.start_time}`)) : null}
                      pseudos={players.map((p) => p.pseudo)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="qg-section" aria-label="Historique">
        <h2>Historique</h2>
        <div className="hist-liste">
          {cartes.map((n) => {
            const cover = coverSrc({ cover_path: n.game_cover_path, cover_url: n.game_cover_url });
            return (
              <a key={n.id} className="hist-card" href={`/nights/${n.id}`}>
                {cover
                  ? <span className="cov hist-cov"><img src={cover} alt="" loading="lazy" /></span>
                  : <span className="cov hist-cov">🎲</span>}
                <span className="hc"><b>{n.game_title ?? 'Soirée de jeux'}</b>
                  <span className="gagnant">{n.gagnant_pseudo ? `👑 ${n.gagnant_pseudo} · ${n.gagnant_score} pts` : 'pas de scores'}</span></span>
                <span className="dt"><span>{dateFormat.format(new Date(`${n.played_at}T12:00:00`))}</span></span>
              </a>
            );
          })}
          {cartes.length === 0 && <p className="hint">Aucune partie terminée — tout est devant vous.</p>}
        </div>
      </section>
    </main>
  );
}
