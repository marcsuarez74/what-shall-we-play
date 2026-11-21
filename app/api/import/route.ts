// app/api/import/route.ts — v4.23.0 : import Myludo en tâche de fond (lib/import-fond.ts).
// GET : l'import en cours (?resume=1 : compteurs seuls, pour la pastille) · POST : lancer ·
// PATCH : réglage, décision sur une ligne, ajout · DELETE : abandonner.
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { nettoyerLigne, type LigneCsv } from '@/lib/import-csv';
import { FORMATS } from '@/lib/formats';
import type { BoxFormat } from '@/lib/types';
import {
  lireImport, resumeImport, creerImport, abandonnerImport, reglerImport, deciderLigne, lancerAjout,
} from '@/lib/import-fond';

const MAX_LIGNES = 3000;

async function auth() {
  const lang = await getLang();
  const user = await getSessionUser();
  return { lang, user, refus: NextResponse.json({ error: t(lang, 'erreurs.nonConnecte') }, { status: 401 }) };
}
const invalide = (lang: Awaited<ReturnType<typeof getLang>>) => NextResponse.json({ error: t(lang, 'csv.errFormat') }, { status: 400 });

export async function GET(req: Request) {
  const { user, refus } = await auth();
  if (!user) return refus;
  if (new URL(req.url).searchParams.get('resume') === '1') return NextResponse.json({ resume: resumeImport(user.id) });
  return NextResponse.json(lireImport(user.id) ?? { import: null, lignes: [] });
}

export async function POST(req: Request) {
  const { lang, user, refus } = await auth();
  if (!user) return refus;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || !Array.isArray(b.lignes) || b.lignes.length === 0 || b.lignes.length > MAX_LIGNES) return invalide(lang);
  const lignes = b.lignes.map(nettoyerLigne).filter((l): l is LigneCsv => !!l);
  if (!lignes.length) return invalide(lang);
  const fmt = FORMATS.includes(b.fmt as BoxFormat) ? (b.fmt as BoxFormat) : 'grand';
  const nom = typeof b.nom === 'string' && b.nom.trim() ? b.nom.trim() : 'collection';
  creerImport(user.id, nom, b.format === 'json' ? 'json' : 'csv', lignes, b.ext === true, fmt);
  return NextResponse.json(lireImport(user.id));
}

export async function PATCH(req: Request) {
  const { lang, user, refus } = await auth();
  if (!user) return refus;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  let ok: boolean;
  if (b.ajouter === true || b.reessayer === true) ok = lancerAjout(user.id, b.reessayer === true);
  else if (typeof b.ligne === 'number') {
    const i = b.ligne;
    if (typeof b.coche === 'boolean') ok = await deciderLigne(user.id, i, { coche: b.coche });
    else if (b.sansCov === true) ok = await deciderLigne(user.id, i, { sansCov: true });
    else if (Number.isInteger(b.bggId) && (b.bggId as number) > 0) ok = await deciderLigne(user.id, i, { bggId: b.bggId as number });
    else ok = false;
  } else {
    ok = reglerImport(user.id, {
      ext: typeof b.ext === 'boolean' ? b.ext : undefined,
      fmt: typeof b.fmt === 'string' ? b.fmt : undefined,
      vu: b.vu === true,
    });
  }
  if (!ok) return NextResponse.json({ error: t(lang, 'bgg.errPasReponse') }, { status: 409 });
  return NextResponse.json(lireImport(user.id) ?? { import: null, lignes: [] });
}

export async function DELETE() {
  const { user, refus } = await auth();
  if (!user) return refus;
  abandonnerImport(user.id);
  return NextResponse.json({ ok: true });
}
