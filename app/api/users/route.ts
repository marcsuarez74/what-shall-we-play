// app/api/users/route.ts — liste des comptes, jamais les invités (pour cocher les joueurs présents)
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { listComptes } from '@/lib/users';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  return NextResponse.json({ users: listComptes() });
}
