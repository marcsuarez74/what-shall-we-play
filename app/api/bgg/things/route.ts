import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { getThings } from '@/lib/bgg';

// v4.22.2 — Fiches de plusieurs jeux (6 au plus) en une requête BGG : l'import départage
// les homonymes en comparant leurs auteurs à ceux du fichier Myludo.
export async function GET(req: Request) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const ids = [...new Set((new URL(req.url).searchParams.get('ids') ?? '').split(',').map(Number))];
  if (ids.length === 0 || ids.length > 6 || ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    return NextResponse.json({ error: t(lang, 'bgg.errId') }, { status: 400 });
  }
  return NextResponse.json({ things: await getThings(ids) });
}
