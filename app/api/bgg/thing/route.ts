import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { getThing, attachCover } from '@/lib/bgg';

export async function GET(req: Request) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const id = Number(params.get('id'));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: t(lang, 'bgg.errId') }, { status: 400 });
  const thing = await getThing(id);
  if (!thing) return NextResponse.json({ error: t(lang, 'bgg.errFiche') }, { status: 502 });
  // cover=0 : aperçu (import CSV) — l'image BGG est montrée sans être téléchargée chez nous ;
  // elle ne l'est qu'à la confirmation de l'import.
  if (params.get('cover') === '0') return NextResponse.json(thing);
  return NextResponse.json(await attachCover(thing));
}
