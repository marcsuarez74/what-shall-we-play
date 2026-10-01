import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { getActiveNight, getPlannedNights, getMyNights, getNightPlayers, getNightPicks } from '@/lib/nights';
import { getDb } from '@/lib/db';
import type { UserLite } from '@/lib/types';
import PlayerChip from '@/components/PlayerChip';
import NightPlanner from '@/components/NightPlanner';
import InviteButton from '@/components/InviteButton';
import TerminerNight from '@/components/TerminerNight';

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
  // Historique : soirées passées uniquement (la nuit du jour vit dans « Ce soir »)
  const today = new Date().toLocaleDateString('sv-SE');
  const history = getMyNights(user.id).filter((n) => n.played_at <= today && (!active || n.id !== active.id));
  const users = getDb().prepare('SELECT id, pseudo, sticker, avatar_path FROM users ORDER BY pseudo COLLATE NOCASE').all() as UserLite[];

  const Picks = ({ nightId }: { nightId: number }) => {
    const picks = getNightPicks(nightId);
    if (picks.length === 0) return null;
    return (
      <ul className="night-picks">
        {picks.map((p) => (
          <li key={p.id}><strong>{p.title}</strong> — tiré par {p.pseudo}</li>
        ))}
      </ul>
    );
  };

  return (
    <main className="page">
      <h1>Mes soirées</h1>

      <section className="qg-section" aria-label="Ce soir">
        <h2>Ce soir</h2>
        {active ? (
          <ul className="nights-list">
            <li className="night-card live">
              <div className="night-card-head">
                <span className="night-label">SOIRÉE EN COURS</span>
                {active.creator_id === user.id && <TerminerNight nightId={active.id} />}
              </div>
              <div className="chips">
                {getNightPlayers(active.id).map((p) => <PlayerChip key={p.id} u={p} />)}
              </div>
              <Picks nightId={active.id} />
            </li>
          </ul>
        ) : (
          <p className="empty">Pas de soirée aujourd&apos;hui — programmez-la ou lancez-la <a href="/etagere">depuis l&apos;étagère</a>.</p>
        )}
      </section>

      <section className="qg-section" aria-label="Programmées">
        <div className="qg-head">
          <h2>Programmées</h2>
          <NightPlanner users={users} meId={user.id} />
        </div>
        {planned.length === 0 ? (
          <p className="empty">Aucune soirée programmée — la prochaine commence ici.</p>
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
        {history.length === 0 ? (
          <p className="empty">Aucune soirée passée — les tirages terminés atterriront ici.</p>
        ) : (
          <ul className="hist-list">
            {history.map((n) => {
              const picks = getNightPicks(n.id);
              return (
                <li key={n.id} className="hist-row">
                  <span className="hist-date">{dateFormat.format(new Date(`${n.played_at}T12:00:00`))}</span>
                  <div className="hist-players">
                    {getNightPlayers(n.id).map((p) => <PlayerChip key={p.id} u={p} />)}
                  </div>
                  {picks.length > 0 && (
                    <span className="hist-picks">
                      {picks.map((p) => p.title).join(', ')}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
