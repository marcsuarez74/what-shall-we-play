// app/api/games/[id]/route.ts — DELETE ; PATCH édite title/box_format/numériques (même validateGameInput, UPDATE)
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { deleteGame, getGame, validateGameInput } from '@/lib/games';
import { getDb } from '@/lib/db';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const res = deleteGame(user.id, Number((await params).id));
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const g = getGame(Number((await params).id));
  if (!g || g.owner_id !== user.id) return NextResponse.json({ error: 'Jeu introuvable' }, { status: 404 });
  const body = await req.json();
  const v = validateGameInput({ ...g, ...body });
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  getDb().prepare(`UPDATE games SET title=?, box_format=?, year=?, publisher=?, min_players=?, max_players=?, playtime_min=?, weight=?, bgg_rating=?, designer=?, artist=?, best_players=? WHERE id=?`)
    .run(v.value.title, v.value.box_format, v.value.year ?? null, v.value.publisher ?? null,
         v.value.min_players ?? null, v.value.max_players ?? null, v.value.playtime_min ?? null,
         v.value.weight ?? null, v.value.bgg_rating ?? null,
         v.value.designer ?? null, v.value.artist ?? null, v.value.best_players ?? null, g.id);
  return NextResponse.json({ ok: true });
}
