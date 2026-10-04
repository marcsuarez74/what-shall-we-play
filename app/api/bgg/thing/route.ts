import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { getThing, attachCover } from '@/lib/bgg';

export async function GET(req: Request) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: t(lang, 'bgg.errId') }, { status: 400 });
  const thing = await getThing(id);
  if (!thing) return NextResponse.json({ error: t(lang, 'bgg.errFiche') }, { status: 502 });
  return NextResponse.json(await attachCover(thing));
}
