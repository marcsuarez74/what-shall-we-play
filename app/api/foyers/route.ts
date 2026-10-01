// app/api/foyers/route.ts — POST créer · PATCH renommer · DELETE dissoudre (créateur)
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { createFoyer, renameFoyer, dissolveFoyer } from '@/lib/foyers';

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { name?: string };
  try {
    const foyer = createFoyer(user.id, body.name);
    return NextResponse.json({ foyer });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const body = await req.json() as { name?: string };
  try {
    renameFoyer(user.id, String(body.name ?? ''));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  try {
    dissolveFoyer(user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
}
