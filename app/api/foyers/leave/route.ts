// app/api/foyers/leave/route.ts — POST quitter le foyer (mes ajouts me suivent)
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { leaveFoyer } from '@/lib/foyers';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

export async function POST() {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  leaveFoyer(user.id);
  return NextResponse.json({ ok: true });
}
