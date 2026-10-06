// app/api/games/route.ts
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { validateGameInput, createGame, listUserLibrary } from '@/lib/games';
import { getUserFoyerId } from '@/lib/foyers';
import { saveCover, isSafeCoverName, formatImage } from '@/lib/storage';

export async function GET() {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  return NextResponse.json({ games: listUserLibrary(user.id) });
}

export async function POST(req: Request) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const form = await req.formData();
  const raw: Record<string, unknown> = {};
  for (const k of ['title', 'box_format', 'bgg_id', 'year', 'publisher', 'min_players', 'max_players', 'playtime_min', 'weight', 'bgg_rating', 'designer', 'artist', 'best_players']) {
    const v = form.get(k);
    if (v !== null) raw[k] = Number.isNaN(Number(v)) || v === '' ? v : Number(v);
  }
  // designer/artist restent des chaînes même si elles sont purement numériques
  for (const k of ['designer', 'artist']) if (raw[k] != null) raw[k] = String(raw[k]);
  const v = validateGameInput(raw, lang);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  let coverPath: string | null = null;
  const coverName = form.get('cover_name'); // pochette déjà rapatriée depuis BGG (Task 5)
  if (typeof coverName === 'string' && isSafeCoverName(coverName)) coverPath = coverName;
  const file = form.get('cover');
  if (file && file instanceof File && file.size > 0) {
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: t(lang, 'jeu.errPochettePoids') }, { status: 400 });
    const buf = Buffer.from(await file.arrayBuffer());
    if (!formatImage(buf)) return NextResponse.json({ error: t(lang, 'jeu.errPochetteExt') }, { status: 400 });
    coverPath = await saveCover(buf);
  }
  const id = createGame(user.id, v.value, coverPath, getUserFoyerId(user.id));
  return NextResponse.json({ id });
}
