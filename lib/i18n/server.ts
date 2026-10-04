import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { LANG_COOKIE, estLangValide, type Lang } from './index';

// Helpers i18n SERVEUR uniquement (next/headers et next/server ne passent pas la
// frontière client) — pages, layout et routes API ; le client lit via useI18n().

// Cookie wsp_lang validé ∈ {fr,en} → sinon 'fr'. Le COMPTE ne force jamais la
// langue : users.lang n'est lue que par login/register qui amorchent le cookie.
export async function getLang(): Promise<Lang> {
  const store = await cookies();
  const v = store.get(LANG_COOKIE)?.value;
  return estLangValide(v) ? v : 'fr';
}

// Cookie langue : 1 an, path / — posé uniquement par les routes API (jamais httpOnly).
export function setLangCookie(response: NextResponse, lang: Lang): void {
  response.cookies.set(LANG_COOKIE, lang, { maxAge: 60 * 60 * 24 * 365, path: '/' });
}
