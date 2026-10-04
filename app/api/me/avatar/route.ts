import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { setAvatar } from '@/lib/users';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

export async function POST(req: Request) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });
  const form = await req.formData();
  const file = form.get('avatar');
  if (!(file instanceof File) || file.size === 0)
    return NextResponse.json({ error: t(lang, 'compte.errAucuneImage') }, { status: 400 });
  if (file.size > 5 * 1024 * 1024)
    return NextResponse.json({ error: t(lang, 'compte.errImagePoids') }, { status: 400 });
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const r = setAvatar(user.id, Buffer.from(await file.arrayBuffer()), ext, lang);
  if (!('ok' in r)) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, path: r.path });
}
