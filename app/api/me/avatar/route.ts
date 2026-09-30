import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { setAvatar } from '@/lib/users';

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const form = await req.formData();
  const file = form.get('avatar');
  if (!(file instanceof File) || file.size === 0)
    return NextResponse.json({ error: 'Aucune image reçue' }, { status: 400 });
  if (file.size > 5 * 1024 * 1024)
    return NextResponse.json({ error: 'Image : 5 Mo maximum' }, { status: 400 });
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const r = setAvatar(user.id, Buffer.from(await file.arrayBuffer()), ext);
  if (!('ok' in r)) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, path: r.path });
}
