import { fr, type CléDict, type ValeurDict } from './fr';
import { en } from './en';

// Cœur i18n — module PUR (aucun import next/*) : importable côté serveur comme
// côté client. Les helpers serveur (getLang, setLangCookie) vivent dans ./server
// car next/headers & next/server sont interdits dans le bundle client.
export { fr } from './fr';
export { en } from './en';
export type { CléDict, ValeurDict } from './fr';

export type Lang = 'fr' | 'en';
export type Dict = Record<CléDict, ValeurDict>;
export const DICTS: Record<Lang, Dict> = { fr, en };
export const LANG_COOKIE = 'wsp_lang';

export function estLangValide(v: string | undefined): v is Lang {
  return v === 'fr' || v === 'en';
}

// t('fr', 'ludotheque.nbJeux', { n: 3 }) → « 3 jeux » : les pluriels sont des
// fonctions du dict, pas de la concaténation côté appelant.
export function t(lang: Lang, clé: CléDict, vars?: Record<string, string | number>): string {
  const v: ValeurDict = DICTS[lang][clé];
  return typeof v === 'function' ? v(vars ?? {}) : v;
}
