import { avatarSrc } from '@/lib/formats';

export interface OwnerLite {
  pseudo: string;
  sticker: string | null;
  avatar_path: string | null;
}

// Rond 16 px en coin de boîte : qui a apporté ce jeu. Photo si présente, sinon sticker.
export default function OwnerBadge({ owner }: { owner: OwnerLite }) {
  const src = avatarSrc(owner);
  return (
    <span className="owner-badge" title={`Apporté par ${owner.pseudo}`}>
      {src ? <img src={src} alt="" /> : <span aria-hidden="true">{owner.sticker ?? '♟'}</span>}
    </span>
  );
}
