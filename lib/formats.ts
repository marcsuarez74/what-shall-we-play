import type { BoxFormat, Game } from './types';
export const FORMATS = ['grand', 'moyen', 'petit', 'mini'] as const;
export const FORMAT_SCALE: Record<BoxFormat, number> = { grand: 1, moyen: 0.78, petit: 0.62, mini: 0.45 };
export const FORMAT_LABEL: Record<BoxFormat, string> = {
  grand: 'Grand · 30×30', moyen: 'Moyen', petit: 'Petit', mini: 'Mini-boîte',
};

// Étiquettes courtes (puces de traits, familles de filtres).
export const FORMAT_SHORT: Record<BoxFormat, string> = {
  grand: 'Grand', moyen: 'Moyen', petit: 'Petit', mini: 'Mini',
};
export function coverSrc(g: Pick<Game, 'cover_path' | 'cover_url'>): string | null {
  if (g.cover_path) return `/api/cover/${g.cover_path}`;
  return g.cover_url;
}
// Avatar d'un utilisateur : photo recadrée si présente, sinon null (le sticker emoji est rendu en texte).
export function avatarSrc(u: { avatar_path?: string | null; sticker?: string | null }): string | null {
  return u.avatar_path ? `/api/cover/${u.avatar_path}` : null;
}
