import { t, type Lang } from './index';

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

// v4.7.0 — le nom affiché d'une partie : son titre, sinon « Partie du jeudi 9 octobre ».
export function titrePartie(lang: Lang, night: { titre?: string | null; played_at: string }): string {
  if (night.titre) return night.titre;
  return t(lang, 'soiree.partieDu', {
    date: formatDate(lang, `${night.played_at}T12:00:00`, { weekday: 'long', day: 'numeric', month: 'long' }),
  });
}
