'use client';
import { avatarSrc } from '@/lib/formats';
import type { UserLite } from '@/lib/types';
import { useI18n } from './LanguageProvider';

// Chip d'un joueur : photo ronde si avatar, sinon sticker emoji (défaut : dé).
// Dans une partie, la chip porte l'état de validation de sa sélection :
// ✓ validée / ⏳ en attente (v3.0.0 — « chacun dit quand il est prêt »).
// Client : le libellé aria suit la langue du contexte (rendu serveur compris).
export default function PlayerChip({ u, etat }: { u: UserLite; etat?: 'ok' | 'attente' }) {
  const src = avatarSrc(u);
  const { t } = useI18n();
  return (
    <span className={`chip ${etat === 'ok' ? 'ok' : ''} ${etat === 'attente' ? 'attente' : ''}`}>
      {src ? <img className="chip-avatar" src={src} alt="" /> : <span aria-hidden="true">{u.sticker ?? '🎲'}</span>}
      {' '}{u.pseudo}
      {u.est_invite ? <span className="tag-invite">{t('soiree.tagInvite')}</span> : null}
      {etat && (
        <span className="st" aria-label={etat === 'ok' ? t('etagere.selectionOk') : t('etagere.selectionAttente')}>
          {etat === 'ok' ? '✓' : '⏳'}
        </span>
      )}
    </span>
  );
}
