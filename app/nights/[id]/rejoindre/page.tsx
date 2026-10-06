// app/nights/[id]/rejoindre/page.tsx — jointure invité par lien (v4.6.0).
// Le lien est validé SERVEUR avant de rendre le formulaire : un lien mort
// n'offre jamais de saisie (garde e2e « lien invalide → message »).
import { getNight } from '@/lib/nights';
import { getSessionUser } from '@/lib/session';
import { getLang } from '@/lib/i18n/server';
import { t } from '@/lib/i18n';
import RejoindreSoiree from '@/components/RejoindreSoiree';

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ k?: string }> }) {
  const lang = await getLang();
  const { id } = await params;
  const { k } = await searchParams;
  const nightId = Number(id);
  const night = Number.isInteger(nightId) ? getNight(nightId) : null;
  const valide = night && typeof k === 'string' && night.lien_token === k;
  if (!valide) {
    return <main className="join-page"><p className="join-erreur">{t(lang, 'soiree.lienInvalide')}</p></main>;
  }
  const me = await getSessionUser();
  return <RejoindreSoiree nightId={nightId} token={k} dejaConnecte={!!me} />;
}
