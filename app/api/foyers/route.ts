// app/api/foyers/route.ts — POST créer · PATCH renommer · DELETE dissoudre (créateur)
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { createFoyer, renameFoyer, dissolveFoyer } from '@/lib/foyers';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

import { refuserInvite } from '@/lib/auth';

export async function POST(req: Request) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const garde = refuserInvite(user, lang);
  if (garde) return NextResponse.json({ error: garde.error }, { status: garde.status }); // un invité ne crée pas de foyer
  const body = await req.json().catch(() => ({})) as { name?: string };
  try {
    const foyer = createFoyer(user.id, body.name, lang);
    return NextResponse.json({ foyer });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const body = await req.json() as { name?: string };
  try {
    renameFoyer(user.id, String(body.name ?? ''), lang);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE() {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  try {
    dissolveFoyer(user.id, lang);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
}
