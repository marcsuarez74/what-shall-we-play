import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { getMyNights, getNightPlayers, getNightPicks } from '@/lib/nights';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' });

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const nights = getMyNights(user.id);
  return (
    <main className="page">
      <h1>Mes soirées</h1>
      {nights.length === 0 ? (
        <p className="empty">
          Aucune soirée pour l&apos;instant. Lancez votre première <a href="/etagere">depuis l&apos;étagère</a>.
        </p>
      ) : (
        <ul className="nights-list">
          {nights.map((n) => {
            const players = getNightPlayers(n.id);
            const picks = getNightPicks(n.id);
            return (
              <li key={n.id} className="night-card">
                <div className="night-card-head">
                  <span className="night-label">SOIRÉE</span>
                  {/* 'T12:00:00' : played_at est une date ISO sans heure (minuit UTC) ;
                      le parse en heure locale évite de perdre un jour selon le fuseau */}
                  <span className="night-date">{dateFormat.format(new Date(`${n.played_at}T12:00:00`))}</span>
                </div>
                <div className="chips">
                  {players.map((p) => <span key={p.id} className="chip">🎲 {p.pseudo}</span>)}
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
    </main>
  );
}
