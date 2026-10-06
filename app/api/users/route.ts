// app/api/users/route.ts — mes relations (amis + foyer, v4.8.0), jamais les invités : pour cocher les joueurs présents
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { listRelations } from '@/lib/amis';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  return NextResponse.json({ users: listRelations(user.id) });
}
