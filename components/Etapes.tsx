'use client';
import { useI18n } from './LanguageProvider';

// Repère « Étape n sur 2 » de l'inscription (v4.18.0) : compte, puis jeux.
export default function Etapes({ n }: { n: 1 | 2 }) {
  const { t } = useI18n();
  return (
    <div className="onb-etapes">
      <span className="pt on" /><span className={`pt${n === 2 ? ' on' : ''}`} />
      <span>{t('bienvenue.etape', { n })}</span>
    </div>
  );
}
