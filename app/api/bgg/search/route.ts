import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { searchBoardgames } from '@/lib/bgg';

export async function GET(req: Request) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const q = new URL(req.url).searchParams.get('q')?.trim();
  if (!q || q.length < 2) return NextResponse.json({ results: [] });
  try {
    return NextResponse.json({ results: await searchBoardgames(q) });
  } catch {
    return NextResponse.json({ error: t(lang, 'bgg.errRecherche') }, { status: 502 });
  }
}
