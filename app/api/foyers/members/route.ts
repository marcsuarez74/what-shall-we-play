// app/api/foyers/members/route.ts — POST { userId } : le créateur retire un membre
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getUserFoyerId, removeMember } from '@/lib/foyers';

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const { userId } = await req.json();
  if (!Number.isInteger(userId)) return NextResponse.json({ error: 'Membre invalide' }, { status: 400 });
  const myFoyerId = getUserFoyerId(user.id);
  if (!myFoyerId) return NextResponse.json({ error: "Vous n'avez pas de foyer" }, { status: 404 });
  const res = removeMember(myFoyerId, userId, user.id);
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}
