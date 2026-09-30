import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { getActiveNight, getPlannedNights, getMyNights, getNightPlayers, getNightPicks } from '@/lib/nights';
import { getDb } from '@/lib/db';
import type { UserLite } from '@/lib/types';
import PlayerChip from '@/components/PlayerChip';
import NightPlanner from '@/components/NightPlanner';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' });
const timeFormat = new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short' });

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const active = getActiveNight(user.id);
  const planned = getPlannedNights(user.id);
  // Historique : soirées passées uniquement (les programmées ont leur section)
  const today = new Date().toLocaleDateString('sv-SE');
  const history = getMyNights(user.id).filter((n) => n.played_at <= today && (!active || n.id !== active.id));
  const users = getDb().prepare('SELECT id, pseudo, sticker, avatar_path FROM users ORDER BY pseudo COLLATE NOCASE').all() as UserLite[];

  const PlannedCard = ({ n }: { n: (typeof planned)[number] }) => {
    const players = getNightPlayers(n.id);
    return (
      <li className="night-card planned-card">
        <div className="night-card-head">
          <span className="night-date">{dateFormat.format(new Date(`${n.played_at}T12:00:00`))}</span>
          {n.start_time && (
            <span className="night-time">🕗 {timeFormat.format(new Date(`${n.played_at}T${n.start_time}`))}</span>
          )}
        </div>
        <div className="chips">
          {players.map((p) => <PlayerChip key={p.id} u={p} />)}
        </div>
      </li>
    );
  };

  return (
    <main className="page">
      <h1>Mes soirées</h1>

      <section aria-label="Ce soir">
        <h2>Ce soir</h2>
        {active ? (
          <ul className="nights-list">
            <li className="night-card">
              <div className="night-card-head">
                <span className="night-label">SOIRÉE EN COURS</span>
              </div>
              <div className="chips">
                {getNightPlayers(active.id).map((p) => <PlayerChip key={p.id} u={p} />)}
              </div>
              {getNightPicks(active.id).length > 0 && (
                <ul className="night-picks">
                  {getNightPicks(active.id).map((p) => (
                    <li key={p.id}>
                      <strong>{p.title}</strong> — tiré par {p.pseudo}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          </ul>
        ) : (
          <p className="empty">Pas de soirée aujourd&apos;hui — programmez-la ou lancez-la <a href="/etagere">depuis l&apos;étagère</a>.</p>
        )}
      </section>

      <section aria-label="Programmées">
        <h2>Programmées</h2>
        {planned.length === 0 ? (
          <p className="empty">Aucune soirée programmée.</p>
        ) : (
          <ul className="nights-list">
            {planned.map((n) => <PlannedCard key={n.id} n={n} />)}
          </ul>
        )}
        <NightPlanner users={users} meId={user.id} />
      </section>

      <section aria-label="Historique">
        <h2>Historique</h2>
        {history.length === 0 ? (
          <p className="empty">Aucune soirée passée.</p>
        ) : (
          <ul className="nights-list">
            {history.map((n) => {
              const picks = getNightPicks(n.id);
              return (
                <li key={n.id} className="night-card">
                  <div className="night-card-head">
                    <span className="night-date">{dateFormat.format(new Date(`${n.played_at}T12:00:00`))}</span>
                  </div>
                  <div className="chips">
                    {getNightPlayers(n.id).map((p) => <PlayerChip key={p.id} u={p} />)}
                  </div>
                  {picks.length > 0 && (
                    <ul className="night-picks">
                      {picks.map((p) => (
                        <li key={p.id}>
                          <strong>{p.title}</strong> — tiré par {p.pseudo}
                        </li>
                      ))}
                    </ul>
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
