// POST : un signalement → issue GitHub. Le navigateur n'appelle jamais
// GitHub : la route sert de relais (jeton serveur), et la capture éventuelle
// est stockée sur le VPS avant l'assemblage du corps markdown.
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { createBugReport, validerSignalement, type BugType } from '@/lib/bugs';
import { saveBugCapture, COVER_EXT, type CoverExt } from '@/lib/storage';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

export async function POST(req: Request) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: t(lang, 'erreurs.requeteInvalide') }, { status: 400 });
  const champ = (k: string) => { const v = form.get(k); return typeof v === 'string' ? v : ''; };

  // Validation AVANT le bloc capture (spec : 1 validation, 2 quota, 3 capture) —
  // une requête invalide ne doit rien écrire sur le VPS : l'uuid d'un fichier
  // orphelin ne serait jamais renvoyé au client en échec. Le double appel avec
  // createBugReport est voulu : la lib reste l'entrée autonome des tests.
  const invalide = validerSignalement({ title: champ('title'), description: champ('description'), type: champ('type') }, lang);
  if (invalide) return NextResponse.json({ error: invalide.error }, { status: invalide.status });

  let device: Record<string, unknown> = {};
  try { device = JSON.parse(champ('device')) ?? {}; } catch { /* bloc technique absent : le corps reste correct */ }
  const d = (k: string) => (typeof device[k] === 'string' && (device[k] as string).length <= 120 ? (device[k] as string) : '');

  let captureName: string | null = null;
  const file = form.get('capture');
  if (file instanceof File && file.size > 0) {
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: t(lang, 'bugs.errCapturePoids') }, { status: 400 });
    const ext = (file.name.split('.').pop() ?? '').toLowerCase();
    if (!(COVER_EXT as readonly string[]).includes(ext)) return NextResponse.json({ error: t(lang, 'bugs.errCaptureExt') }, { status: 400 });
    captureName = saveBugCapture(Buffer.from(await file.arrayBuffer()), ext as CoverExt);
  }

  const res = await createBugReport({
    userId: user.id, pseudo: user.pseudo, type: champ('type') as BugType,
    title: champ('title'), description: champ('description'), page: champ('page'),
    device: { appareil: d('appareil'), navigateur: d('navigateur'), ecran: d('ecran'), langue: d('langue'), installation: d('installation') },
    uaBrut: req.headers.get('user-agent') ?? 'inconnu', captureName,
  }, lang);
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json(res);
}
