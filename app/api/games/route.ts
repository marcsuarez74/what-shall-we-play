// app/api/games/route.ts
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { validateGameInput, createGame, listMyGames } from '@/lib/games';
import { saveCover, isSafeCoverName, COVER_EXT } from '@/lib/storage';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  return NextResponse.json({ games: listMyGames(user.id) });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const form = await req.formData();
  const raw: Record<string, unknown> = {};
  for (const k of ['title', 'box_format', 'bgg_id', 'year', 'publisher', 'min_players', 'max_players', 'playtime_min', 'weight', 'bgg_rating']) {
    const v = form.get(k);
    if (v !== null) raw[k] = Number.isNaN(Number(v)) || v === '' ? v : Number(v);
  }
  const v = validateGameInput(raw);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  let coverPath: string | null = null;
  const coverName = form.get('cover_name'); // pochette déjà rapatriée depuis BGG (Task 5)
  if (typeof coverName === 'string' && isSafeCoverName(coverName)) coverPath = coverName;
  const file = form.get('cover');
  if (file && file instanceof File && file.size > 0) {
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'Pochette : 5 Mo maximum' }, { status: 400 });
    const ext = file.name.split('.').pop()?.toLowerCase() as (typeof COVER_EXT)[number] | undefined;
    if (!ext || !COVER_EXT.includes(ext)) return NextResponse.json({ error: 'Pochette : jpg, png ou webp' }, { status: 400 });
    coverPath = saveCover(Buffer.from(await file.arrayBuffer()), ext);
  }
  const id = createGame(user.id, v.value, coverPath);
  return NextResponse.json({ id });
}
