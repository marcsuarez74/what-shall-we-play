// app/api/users/route.ts — liste des inscrits (pour cocher les joueurs présents)
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getDb } from '@/lib/db';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  return NextResponse.json({ users: getDb().prepare('SELECT id, pseudo, sticker, avatar_path FROM users ORDER BY pseudo COLLATE NOCASE').all() });
}
