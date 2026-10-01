import { avatarSrc } from '@/lib/formats';
import type { UserLite } from '@/lib/types';

// Chip d'un joueur : photo ronde si avatar, sinon sticker emoji (défaut : dé).
// Dans une partie, la chip porte l'état de validation de sa sélection :
// ✓ validée / ⏳ en attente (v3.0.0 — « chacun dit quand il est prêt »).
export default function PlayerChip({ u, etat }: { u: UserLite; etat?: 'ok' | 'attente' }) {
  const src = avatarSrc(u);
  return (
    <span className={`chip ${etat === 'ok' ? 'ok' : ''} ${etat === 'attente' ? 'attente' : ''}`}>
      {src ? <img className="chip-avatar" src={src} alt="" /> : <span aria-hidden="true">{u.sticker ?? '🎲'}</span>}
      {' '}{u.pseudo}
      {etat && (
        <span className="st" aria-label={etat === 'ok' ? 'sélection validée' : 'sélection en attente'}>
          {etat === 'ok' ? '✓' : '⏳'}
        </span>
      )}
    </span>
  );
}
