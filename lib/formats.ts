import type { BoxFormat, Game } from './types';
import { t, type CléDict, type Lang } from './i18n';
export const FORMATS = ['grand', 'moyen', 'petit', 'mini'] as const;
export const FORMAT_SCALE: Record<BoxFormat, number> = { grand: 1, moyen: 0.78, petit: 0.62, mini: 0.45 };
// v4.0.0 : les libellés de format dépendent de la langue via formatLabel/formatShort
// (dict i18n, clés formats.*). Les VALEURS SQL ('mini'|'petit'|'moyen'|'grand') restent
// des données — jamais traduites. Ces deux constantes FR : repli consommé par les zones
// pas encore migrées (ludothèque, import BGG) — à supprimer quand la dernière zone passe.
export const FORMAT_LABEL: Record<BoxFormat, string> = {
  grand: 'Grand · 30×30', moyen: 'Moyen', petit: 'Petit', mini: 'Mini-boîte',
};

// Étiquettes courtes (puces de traits, familles de filtres).
export const FORMAT_SHORT: Record<BoxFormat, string> = {
  grand: 'Grand', moyen: 'Moyen', petit: 'Petit', mini: 'Mini',
};

// Clé du dict i18n par format — cartographie explicite, contrôlée par tsc.
const CLÉ_COURT: Record<BoxFormat, CléDict> = {
  grand: 'formats.grand', moyen: 'formats.moyen', petit: 'formats.petit', mini: 'formats.mini',
};
const CLÉ_LABEL: Record<BoxFormat, CléDict> = {
  grand: 'formats.grandLabel', moyen: 'formats.moyenLabel', petit: 'formats.petitLabel', mini: 'formats.miniLabel',
};
export function formatLabel(f: BoxFormat, lang: Lang): string {
  return t(lang, CLÉ_LABEL[f]);
}
export function formatShort(f: BoxFormat, lang: Lang): string {
  return t(lang, CLÉ_COURT[f]);
}
export function coverSrc(g: Pick<Game, 'cover_path' | 'cover_url'>): string | null {
  if (g.cover_path) return `/api/cover/${g.cover_path}`;
  return g.cover_url;
}
// Avatar d'un utilisateur : photo recadrée si présente, sinon null (le sticker emoji est rendu en texte).
export function avatarSrc(u: { avatar_path?: string | null; sticker?: string | null }): string | null {
  return u.avatar_path ? `/api/cover/${u.avatar_path}` : null;
}
