// app/api/games/[id]/enrichir/route.ts — import BGG : complète une fiche manuelle.
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { enrichirJeu } from '@/lib/games';

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v :
  typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.slice(0, 120) : null);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const res = enrichirJeu(user.id, Number((await params).id), {
    bgg_id: num(b.bgg_id), year: num(b.year), publisher: str(b.publisher),
    min_players: num(b.min_players), max_players: num(b.max_players), playtime_min: num(b.playtime_min),
    weight: num(b.weight), bgg_rating: num(b.bgg_rating), designer: str(b.designer),
    artist: str(b.artist), best_players: num(b.best_players),
    cover_name: typeof b.cover_name === 'string' ? b.cover_name : null,
  });
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}
