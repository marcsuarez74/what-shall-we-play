import type { Lang } from './index';

// Formats Intl par langue — remplace les Intl.DateTimeFormat('fr-FR',…) et
// toLocaleString('fr-FR') éparpillés (wires dans les zones T2-T6).
// en-GB : formats de date proches des habitudes fr (jour/mois/année).
const LOCALES: Record<Lang, string> = { fr: 'fr-FR', en: 'en-GB' };

export function formatDate(lang: Lang, date: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(LOCALES[lang], opts).format(d);
}

export function formatNombre(lang: Lang, n: number, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(LOCALES[lang], opts).format(n);
}
