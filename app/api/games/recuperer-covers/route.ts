// Récupération des pochettes manquantes (v4.5.0) : boucle sur les jeux BGG de la
// ludothèque sans image, fiche via /thing (garde 1 req/s, cache 30 j) + download.
// Un seul appel client : la garde de débit sérialise (~40 s pour 42 jeux).
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { getThing, attachCover } from '@/lib/bgg';
import { listUserLibrary } from '@/lib/games';
import { isSafeCoverName } from '@/lib/storage';
import { getDb } from '@/lib/db';

export async function POST() {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const cibles = listUserLibrary(user.id).filter((g): g is typeof g & { bgg_id: number } => g.bgg_id != null && !g.cover_path);
  let faites = 0;
  for (const g of cibles) {
    const thing = await getThing(g.bgg_id);
    if (!thing) continue;
    const withCover = await attachCover(thing);
    if (!withCover.coverName || !isSafeCoverName(withCover.coverName)) continue;
    const r = getDb()
      .prepare("UPDATE games SET cover_path = ? WHERE id = ? AND (cover_path IS NULL OR cover_path = '')")
      .run(withCover.coverName, g.id);
    faites += r.changes;
  }
  return NextResponse.json({ faites, total: cibles.length });
}
