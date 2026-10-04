import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { changeCode } from '@/lib/users';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

export async function POST(req: Request) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const { current, next } = await req.json();
  const r = changeCode(user.id, current, next, lang);
  if (!('ok' in r)) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}
