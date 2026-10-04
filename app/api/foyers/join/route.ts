// app/api/foyers/join/route.ts — POST rejoindre un foyer avec son code d'invitation.
// Répond avec les doublons détectés : le client les fait trier un à un (fusion guidée).
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { joinFoyerByCode } from '@/lib/foyers';
import { getPickCounts } from '@/lib/games';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

export async function POST(req: Request) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const body = await req.json() as { code?: string };
  if (typeof body.code !== 'string' || !body.code.trim())
    return NextResponse.json({ error: t(lang, 'foyer.errCodeRequis') }, { status: 400 });
  try {
    const res = joinFoyerByCode(user.id, body.code, lang);
    const picks = getPickCounts();
    const dupes = res.dupes.map(({ a, b }) => ({
      a: { ...a, picks: picks[a.id] ?? 0 },
      b: { ...b, picks: picks[b.id] ?? 0 },
    }));
    return NextResponse.json({ id: res.id, name: res.name, dupes });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
