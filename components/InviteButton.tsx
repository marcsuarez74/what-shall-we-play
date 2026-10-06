'use client';
import { buildInviteMessage, shareMessage } from '@/lib/announce';
import { useI18n } from './LanguageProvider';

// Invitation : message composé par l'app (dans la langue du cookie), envoi via
// partage natif sinon wa.me. La date/heure arrive déjà formatée par la page.
export default function InviteButton({ dateLong, time, pseudos, lien, titre, label }: {
  dateLong: string;
  time: string | null;
  pseudos: string[];
  lien?: string;
  titre?: string | null;
  label?: string; // v4.7.0 : « 🔗 Inviter » quand le message porte le lien
}) {
  const { lang, t } = useI18n();
  return (
    <button type="button" className="btn-ghost invite-btn"
            onClick={() => shareMessage(buildInviteMessage({ dateLong, time, pseudos, lien, titre, lang }))}>
      {label ?? t('soiree.inviterWhatsApp')}
    </button>
  );
}
