'use client';
import { avatarSrc } from '@/lib/formats';
import { useI18n } from './LanguageProvider';

export interface OwnerLite {
  pseudo: string;
  sticker: string | null;
  avatar_path: string | null;
}

// Rond 16 px en coin de boîte : qui a apporté ce jeu. Photo si présente, sinon sticker.
// Client : le title suit la langue du contexte (composant rendu par ShelfClient).
export default function OwnerBadge({ owner }: { owner: OwnerLite }) {
  const src = avatarSrc(owner);
  const { t } = useI18n();
  return (
    <span className="owner-badge" title={`${t('fiche.apportePar')} ${owner.pseudo}`}>
      {src ? <img src={src} alt="" /> : <span aria-hidden="true">{owner.sticker ?? '♟'}</span>}
    </span>
  );
}
