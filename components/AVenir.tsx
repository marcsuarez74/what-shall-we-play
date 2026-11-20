import Link from 'next/link';
import { getNightPlayers, getShelfGames, joursAvant } from '@/lib/nights';
import { t, type Lang } from '@/lib/i18n';
import { dayMonth, formatDate } from '@/lib/i18n/format';
import type { Night } from '@/lib/types';

// v4.21.0 — Parties à venir sur l'étagère (composant serveur).
const MAX = 2; // au-delà : « Voir tout (N) › » vers Parties

const pseudoCreateur = (n: Night) => getNightPlayers(n.id).find((p) => p.id === n.creator_id)?.pseudo ?? '';
const nomPartie = (lang: Lang, n: Night, createur: string) => n.titre || t(lang, 'avenir.partieDe', { p: createur });

function dateCourte(lang: Lang, n: Night): string {
  const jour = formatDate(lang, `${n.played_at}T12:00:00`, { weekday: 'short', day: 'numeric', month: 'short' });
  return n.start_time ? `${jour} · ${formatDate(lang, `${n.played_at}T${n.start_time}`, { timeStyle: 'short' })}` : jour;
}

/** Pas de partie aujourd'hui : les 2 prochaines, de la plus proche à la plus lointaine. */
export function AVenir({ nights, meId, lang }: { nights: Night[]; meId: number; lang: Lang }) {
  if (nights.length === 0) return null;
  return (
    <section className="avenir" aria-label={t(lang, 'avenir.titre')}>
      <div className="qg-head">
        <h2>{t(lang, 'avenir.titre')}</h2>
        {nights.length > MAX && <Link className="link-btn" href="/nights">{t(lang, 'avenir.voirTout', { n: nights.length })}</Link>}
      </div>
      <ul className="avenir-list">
        {nights.slice(0, MAX).map((n) => {
          const { day, month } = dayMonth(n.played_at, lang);
          const jours = joursAvant(n.played_at);
          const players = getNightPlayers(n.id);
          const createur = players.find((p) => p.id === n.creator_id)?.pseudo ?? '';
          return (
            <li key={n.id}>
              <Link className="av-card" href={`/etagere?night=${n.id}`}>
                <div className="plan-date" aria-hidden="true">
                  <span className="plan-day">{day}</span>
                  <span className="plan-month">{month}</span>
                </div>
                <div className="av-body">
                  <span className="av-when">
                    {dateCourte(lang, n)}
                    <small>{jours === 1 ? t(lang, 'avenir.demain') : t(lang, 'avenir.dansJours', { n: jours })}</small>
                  </span>
                  <span className="av-titre">{nomPartie(lang, n, createur)}</span>
                  <span className="av-meta">
                    {t(lang, 'avenir.joueurs', { n: players.length })} · {t(lang, 'avenir.jeux', { n: getShelfGames(n.id).length })}
                    {n.creator_id !== meId && createur && <> · {t(lang, 'avenir.par', { p: createur })}</>}
                  </span>
                </div>
                <span className="av-chev" aria-hidden="true">›</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Partie ce soir : une ligne discrète vers la suivante. */
export function Ensuite({ night, lang }: { night: Night; lang: Lang }) {
  return (
    <Link className="ensuite" href={`/etagere?night=${night.id}`}>
      📅 {t(lang, 'avenir.ensuite')} <b>{formatDate(lang, `${night.played_at}T12:00:00`, { weekday: 'short', day: 'numeric', month: 'short' })}</b> · {nomPartie(lang, night, pseudoCreateur(night))}
      <span className="av-chev" aria-hidden="true">›</span>
    </Link>
  );
}
