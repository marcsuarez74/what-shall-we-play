// app/api/bgg/collection/route.ts — lecture seule de la collection possédée (own=1).
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { collectionUtilisateur } from '@/lib/bgg';

export async function GET(req: Request) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const username = new URL(req.url).searchParams.get('username') ?? '';
  const r = await collectionUtilisateur(username, 15000, lang);
  // Union non discriminée ({ ok: true } | { error, status }) : resserrement via 'in',
  // même motif que app/api/games/[id]/enrichir/route.ts.
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ jeux: r.jeux });
}
