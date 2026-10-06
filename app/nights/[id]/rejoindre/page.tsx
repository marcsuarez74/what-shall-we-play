// app/nights/[id]/rejoindre/page.tsx — jointure par lien (v4.6.0, refondue v4.7.0).
// Le lien est validé SERVEUR avant de rendre le formulaire : un lien mort
// n'offre jamais de saisie. v4.7.0 : l'invitation se lit d'abord (qui invite,
// quand, combien de joueurs et de jeux) ; un invité déjà dans la soirée y retourne.
import { redirect } from 'next/navigation';
import { getNight, getNightPlayers, getShelfGames, isNightParticipant } from '@/lib/nights';
import { getSessionUser, getSessionInvite } from '@/lib/session';
import { getDb } from '@/lib/db';
import { getLang } from '@/lib/i18n/server';
import { t } from '@/lib/i18n';
import { formatDate, titrePartie } from '@/lib/i18n/format';
import RejoindreSoiree from '@/components/RejoindreSoiree';

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ k?: string }> }) {
  const lang = await getLang();
  const { id } = await params;
  const { k } = await searchParams;
  const nightId = Number(id);
  const night = Number.isInteger(nightId) ? getNight(nightId) : null;
  const valide = night && night.status !== 'termine' && typeof k === 'string' && night.lien_token === k;
  if (!valide) {
    return <main className="join-page"><p className="join-erreur">{t(lang, 'soiree.lienInvalide')}</p></main>;
  }
  const invite = await getSessionInvite();
  if (invite && isNightParticipant(nightId, invite.id)) redirect('/invite');
  const me = await getSessionUser();
  if (me && isNightParticipant(nightId, me.id)) redirect(`/etagere?night=${nightId}`);
  const hote = (getDb().prepare('SELECT pseudo FROM users WHERE id = ?').get(night.creator_id) as { pseudo: string }).pseudo;
  return (
    <RejoindreSoiree nightId={nightId} token={k} dejaConnecte={!!me}
                     hote={hote} titre={titrePartie(lang, night)}
                     dateLong={formatDate(lang, `${night.played_at}T12:00:00`, { weekday: 'long', day: 'numeric', month: 'long' })}
                     time={night.start_time ? formatDate(lang, `${night.played_at}T${night.start_time}`, { timeStyle: 'short' }) : null}
                     nbJoueurs={getNightPlayers(nightId).length} nbJeux={getShelfGames(nightId).length} />
  );
}
