import { avatarSrc } from '@/lib/formats';
import type { UserLite } from '@/lib/types';

// Chip d'un joueur : photo ronde si avatar, sinon sticker emoji (défaut : dé).
export default function PlayerChip({ u }: { u: UserLite }) {
  const src = avatarSrc(u);
  return (
    <span className="chip">
      {src ? <img className="chip-avatar" src={src} alt="" /> : <span aria-hidden="true">{u.sticker ?? '🎲'}</span>}
      {' '}{u.pseudo}
    </span>
  );
}
