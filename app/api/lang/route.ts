import { NextResponse } from 'next/server';
import { estLangValide } from '@/lib/i18n';
import { setLangCookie } from '@/lib/i18n/server';
import { getSessionUser } from '@/lib/session';
import { getDb } from '@/lib/db';

// Bascule de langue : pose le cookie wsp_lang (1 an, path /) et mémorise le choix
// sur le compte si une session est ouverte (relue au prochain login).
export async function POST(req: Request) {
  const { lang } = await req.json();
  if (!estLangValide(lang)) return NextResponse.json({ error: 'Langue invalide' }, { status: 400 });
  const response = NextResponse.json({ ok: true });
  setLangCookie(response, lang);
  const me = await getSessionUser();
  if (me) getDb().prepare('UPDATE users SET lang = ? WHERE id = ?').run(lang, me.id);
  return response;
}
