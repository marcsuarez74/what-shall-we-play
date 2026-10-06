// app/api/nights/[id]/rejoindre/route.ts — POST { nom?, k } (v4.6.0, invités par lien).
// Un compte sessionné rejoint avec son compte ; sinon le nom crée un invité
// (session 1 an + jeton d'appareil : le client le garde sous wsp_night_<id> —
// leçon v4.5.0, le cookie de la PWA peut disparaître, pas localStorage).
import { NextResponse } from 'next/server';
import { rejoindreParLien } from '@/lib/nights';
import { createSession, createDeviceToken } from '@/lib/auth';
import { getSessionUser, COOKIE_NAME, cookieOpts } from '@/lib/session';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const lang = await getLang();
  const nightId = Number((await params).id);
  if (!Number.isInteger(nightId)) return NextResponse.json({ error: t(lang, 'soiree.lienInvalide') }, { status: 404 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const me = await getSessionUser();
  const r = rejoindreParLien(nightId, body.k, body.nom, me ? { id: me.id } : null, lang);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  if (r.mode === 'invite' && typeof r.inviteId === 'number') {
    const jours = 365;
    const response = NextResponse.json({ mode: 'invite', device_token: createDeviceToken(r.inviteId) });
    response.cookies.set(COOKIE_NAME, createSession(r.inviteId, jours), cookieOpts(jours));
    return response;
  }
  return NextResponse.json({ mode: 'compte' });
}
