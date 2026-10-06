import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { getActiveNight, getPlannedNights, getHistoryCards, getNightPlayers, getNightGame } from '@/lib/nights';
import { coverSrc } from '@/lib/formats';
import { getDb } from '@/lib/db';
import { t, type Lang } from '@/lib/i18n';
import { formatDate } from '@/lib/i18n/format';
import { getLang } from '@/lib/i18n/server';
import type { UserLite } from '@/lib/types';
import PlayerChip from '@/components/PlayerChip';
import NightPlanner from '@/components/NightPlanner';
import InviteButton from '@/components/InviteButton';
import TerminerNight from '@/components/TerminerNight';
import UserMenu from '@/components/UserMenu';

// « 2026-10-02 » → jour « 2 » + mois « oct. » — la date est le héros d'une carte programmée.
function dayMonth(playedAt: string, lang: Lang): { day: string; month: string } {
  return {
    day: String(Number(playedAt.split('-')[2])),
    month: formatDate(lang, `${playedAt}T12:00:00`, { month: 'short' }).replace('.', ''),
  };
}

export default async function Page() {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const active = getActiveNight(user.id);
  const planned = getPlannedNights(user.id);
  // Historique : une carte par partie terminée (gagnant 👑 · score, date) → détail.
  const cartes = getHistoryCards(user.id);
  // Le jeu de la partie (boîte sortie) — les picks cumulés ne s'affichent plus (v3.3.0).
  const activeGame = active?.game_id ? getNightGame(active.id) : null;
  const users = getDb().prepare('SELECT id, pseudo, sticker, avatar_path FROM users ORDER BY pseudo COLLATE NOCASE').all() as UserLite[];
  // Dates longues / heures des cartes programmées, dans la langue du cookie.
  const dateLongue = (playedAt: string) => formatDate(lang, `${playedAt}T12:00:00`, { dateStyle: 'long' });
  const heureCourte = (playedAt: string, start: string | null | undefined) =>
    start ? formatDate(lang, `${playedAt}T${start}`, { timeStyle: 'short' }) : null;

  return (
    <main className="page">
      <div className="page-head">
        <h1>{t(lang, 'soiree.titre')}</h1>
        <UserMenu me={user} />
      </div>

      <section className="qg-section" aria-label={t(lang, 'soiree.ceSoir')}>
        <h2>{t(lang, 'soiree.ceSoir')}</h2>
        {active ? (
          <ul className="nights-list">
            <li className="night-card live">
              <div className="night-card-head">
                {active.status === 'en_jeu'
                  ? <span className="badge-etat b-enjeu"><span className="pt" />{t(lang, 'etagere.enJeu')}</span>
                  : <span className="badge-etat b-prep"><span className="pt" />{t(lang, 'etagere.enPrep')}</span>}
                {active.creator_id === user.id && <TerminerNight nightId={active.id} status={active.status} />}
              </div>
              <div className="chips">
                {getNightPlayers(active.id).map((p) => <PlayerChip key={p.id} u={p} />)}
              </div>
              {activeGame && <p className="jeu-partie">{t(lang, 'soiree.jeuPartie', { j: activeGame.title })}</p>}
            </li>
          </ul>
        ) : (
          <p className="empty">{t(lang, 'soiree.videAvant')}<a href="/etagere">{t(lang, 'soiree.videLien')}</a>{t(lang, 'soiree.videApres')}</p>
        )}
      </section>

      <section className="qg-section" aria-label={t(lang, 'soiree.programmees')}>
        <div className="qg-head">
          <h2>{t(lang, 'soiree.programmees')}</h2>
          <NightPlanner users={users} meId={user.id} />
        </div>
        {planned.length === 0 ? (
          <p className="empty">{t(lang, 'soiree.aucuneProgrammee')}</p>
        ) : (
          <ul className="nights-list">
            {planned.map((n) => {
              const players = getNightPlayers(n.id);
              const { day, month } = dayMonth(n.played_at, lang);
              return (
                <li key={n.id} className="night-card planned-card">
                  <div className="plan-date" aria-hidden="true">
                    <span className="plan-day">{day}</span>
                    <span className="plan-month">{month}</span>
                  </div>
                  <div className="plan-body">
                    <div className="plan-when">
                      <span className="plan-long">{dateLongue(n.played_at)}</span>
                      {n.start_time && (
                        <span className="plan-time">{heureCourte(n.played_at, n.start_time)}</span>
                      )}
                    </div>
                    <div className="chips">
                      {players.map((p) => <PlayerChip key={p.id} u={p} />)}
                    </div>
                    <InviteButton
                      dateLong={dateLongue(n.played_at)}
                      time={heureCourte(n.played_at, n.start_time)}
                      pseudos={players.map((p) => p.pseudo)}
                      lien={n.creator_id === user.id && n.lien_token
                        ? `${process.env.PUBLIC_URL ?? 'https://what-shall-we-play.marco-studio.fr'}/nights/${n.id}/rejoindre?k=${n.lien_token}`
                        : undefined}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="qg-section" aria-label={t(lang, 'soiree.historique')}>
        <h2>{t(lang, 'soiree.historique')}</h2>
        <div className="hist-liste">
          {cartes.map((n) => {
            const cover = coverSrc({ cover_path: n.game_cover_path, cover_url: n.game_cover_url });
            return (
              <a key={n.id} className="hist-card" href={`/nights/${n.id}`}>
                {cover
                  ? <span className="cov hist-cov"><img src={cover} alt="" loading="lazy" /></span>
                  : <span className="cov hist-cov">🎲</span>}
                <span className="hc"><b>{n.game_title ?? t(lang, 'soiree.sansJeu')}</b>
                  <span className="gagnant">{n.gagnant_pseudo ? t(lang, 'soiree.gagnant', { p: n.gagnant_pseudo, s: n.gagnant_score as number }) : t(lang, 'soiree.pasDeScores')}</span></span>
                <span className="dt"><span>{dateLongue(n.played_at)}</span></span>
              </a>
            );
          })}
          {cartes.length === 0 && <p className="hint">{t(lang, 'soiree.aucuneTerminee')}</p>}
        </div>
      </section>
    </main>
  );
}
