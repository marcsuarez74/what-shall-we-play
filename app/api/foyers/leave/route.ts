// app/api/foyers/leave/route.ts — POST quitter le foyer (mes ajouts me suivent)
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { leaveFoyer } from '@/lib/foyers';

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  leaveFoyer(user.id);
  return NextResponse.json({ ok: true });
}
