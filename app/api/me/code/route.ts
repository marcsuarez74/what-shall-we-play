import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { changeCode, codeCorrect } from '@/lib/users';
import { minutesBloquees, noterEchec, effacer } from '@/lib/limite';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// 5 codes actuels faux / 15 min par compte : la vérification seule (étape 1) ne doit pas
// devenir un moyen de deviner le PIN d'une session laissée ouverte.
const MAX_ECHECS = 5;

// Corps { current } seul = vérification du code actuel (étape 1) ;
// { current, next } = changement effectif (étape 3).
export async function POST(req: Request) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const cle = `code:${user.id}`;
  const attente = minutesBloquees(cle, MAX_ECHECS);
  if (attente) return NextResponse.json({ error: t(lang, 'auth.errTropDeTentatives', { min: attente }) }, { status: 429 });
  const { current, next } = await req.json();
  if (next === undefined) {
    if (!codeCorrect(user.id, current)) {
      noterEchec(cle);
      return NextResponse.json({ error: t(lang, 'compte.errCodeActuel') }, { status: 401 });
    }
    return NextResponse.json({ ok: true });
  }
  const r = changeCode(user.id, current, next, lang);
  if (!('ok' in r)) {
    if (r.status === 401) noterEchec(cle);
    return NextResponse.json({ error: r.error }, { status: r.status });
  }
  effacer(cle);
  return NextResponse.json({ ok: true });
}
