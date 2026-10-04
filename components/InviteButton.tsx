'use client';
import { buildInviteMessage, shareMessage } from '@/lib/announce';
import { useI18n } from './LanguageProvider';

// Invitation : message composé par l'app (dans la langue du cookie), envoi via
// partage natif sinon wa.me. La date/heure arrive déjà formatée par la page.
export default function InviteButton({ dateLong, time, pseudos }: {
  dateLong: string;
  time: string | null;
  pseudos: string[];
}) {
  const { lang, t } = useI18n();
  return (
    <button type="button" className="btn-ghost invite-btn"
            onClick={() => shareMessage(buildInviteMessage({ dateLong, time, pseudos, lang }))}>
      {t('soiree.inviterWhatsApp')}
    </button>
  );
}
