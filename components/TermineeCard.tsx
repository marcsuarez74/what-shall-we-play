import Link from 'next/link';
import { t, type Lang } from '@/lib/i18n';

// v3.3 — la partie du jour est terminée : l'étagère repart vide, les scores
// vivent dans l'onglet Parties. (Le serveur ne passe que ce qui existe.)
// Composant serveur : la langue arrive en prop depuis la page (getLang).
export default function TermineeCard({ nightId, gameTitle, lang }: { nightId: number; gameTitle: string | null; lang: Lang }) {
  return (
    <section className="night-card terminee" aria-label={t(lang, 'etagere.soireeTermineeAria')}>
      <div className="night-card-head">
        <span className="night-label">{t(lang, 'etagere.soireeDuJour')}</span>
        <span className="badge-etat b-term"><span className="pt" />{t(lang, 'etagere.terminee')}</span>
      </div>
      <div className="bandeau g">
        <span className="b-cov">📦</span>
        <div><b>{gameTitle ?? t(lang, 'etagere.partieTerminee')}</b><span>{t(lang, 'etagere.scoresOk')}</span></div>
      </div>
      <Link className="btn-copper vert" href={`/nights/${nightId}`}>{t(lang, 'etagere.voirScores')}</Link>
    </section>
  );
}
