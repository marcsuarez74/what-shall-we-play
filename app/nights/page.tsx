import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { getActiveNight, getPlannedNights, getHistoryCards, getNightPlayers, getNightGame, getShelfGames, lienInvitation } from '@/lib/nights';
import { listRelations } from '@/lib/amis';
import { mesCercles, membresCercle } from '@/lib/cercles';
import { mesInvitations, invitesNuit } from '@/lib/invitations';
import { coverSrc } from '@/lib/formats';
import { t, type Lang } from '@/lib/i18n';
import { formatDate, titrePartie } from '@/lib/i18n/format';
import { getLang } from '@/lib/i18n/server';
import PlayerChip from '@/components/PlayerChip';
import NightPlanner from '@/components/NightPlanner';
import InviteButton from '@/components/InviteButton';
import TerminerNight from '@/components/TerminerNight';
import UserMenu from '@/components/UserMenu';
import UserSync from '@/components/UserSync';
import SupprimerPartie from '@/components/SupprimerPartie';
import BoutonAction from '@/components/BoutonAction';
import BandeauNotifications from '@/components/BandeauNotifications';

// « 2026-10-02 » → jour « 2 » + mois « oct. » — la date est le héros d'une carte programmée.
function dayMonth(playedAt: string, lang: Lang): { day: string; month: string } {
  return {
    day: String(Number(playedAt.split('-')[2])),
    month: formatDate(lang, `${playedAt}T12:00:00`, { month: 'short' }).replace('.', ''),
  };
}

export default async function Page() {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const active = getActiveNight(user.id);
  const planned = getPlannedNights(user.id);
  // Historique : une carte par partie terminée (gagnant 👑 · score, date) → détail.
  const cartes = getHistoryCards(user.id);
  // Le jeu de la partie (boîte sortie) — les picks cumulés ne s'affichent plus (v3.3.0).
  const activeGame = active?.game_id ? getNightGame(active.id) : null;
  // v4.8.0 : moi (joueur d'office) puis mes amis et mon foyer ; les cercles pour inviter en un geste.
  const users = [{ id: user.id, pseudo: user.pseudo, sticker: user.sticker, avatar_path: user.avatar_path }, ...listRelations(user.id)];
  const cercles = mesCercles(user.id).map((c) => ({
    id: c.id, nom: c.nom, membres: membresCercle(c.id).filter((m) => m.etat === 'membre').map((m) => m.id),
  }));
  const invitations = mesInvitations(user.id);
  // Dates longues / heures des cartes programmées, dans la langue du cookie.
  const dateLongue = (playedAt: string) => formatDate(lang, `${playedAt}T12:00:00`, { dateStyle: 'long' });
  const heureCourte = (playedAt: string, start: string | null | undefined) =>
    start ? formatDate(lang, `${playedAt}T${start}`, { timeStyle: 'short' }) : null;

  return (
    <main className="page">
      {/* v4.7.0 : un invité qui rejoint, une partie supprimée — la page suit en direct */}
      <UserSync />
      <div className="page-head">
        <h1>{t(lang, 'soiree.titre')}</h1>
        <UserMenu me={user} />
      </div>

      {invitations.length > 0 && (
        <section className="qg-section" aria-label={t(lang, 'soiree.invitations')}>
          <BandeauNotifications />
          <h2>{t(lang, 'soiree.invitations')}</h2>
          <ul className="nights-list">
            {invitations.map((n) => (
              <li key={n.id} className="night-card rsvp">
                <div className="plan-top">
                  <span className="plan-titre">{titrePartie(lang, n)}</span>
                  <span className="badge-etat b-prep"><span className="pt" />{t(lang, 'soiree.badgeInvitation')}</span>
                </div>
                <div className="plan-when">
                  <span className="plan-long">{dateLongue(n.played_at)}</span>
                  {n.start_time && <span className="plan-time">{heureCourte(n.played_at, n.start_time)}</span>}
                </div>
                <p className="rsvp-qui">
                  <PlayerChip u={{ id: n.creator_id, pseudo: n.hote_pseudo, sticker: n.hote_sticker, avatar_path: n.hote_avatar }} />
                  {' '}{[t(lang, 'invite.tInvite', { hote: '' }).trim(), n.via_nom && t(lang, 'soiree.viaCercle', { nom: n.via_nom }),
                    t(lang, 'soiree.nbInvites', { n: n.nb_invites })].filter(Boolean).join(' · ')}
                </p>
                <div className="rsvp-btns">
                  <BoutonAction url={`/api/nights/${n.id}/invitation`} body={{ reponse: 'dispo' }} className="btn-dispo" label={t(lang, 'soiree.dispo')} />
                  <BoutonAction url={`/api/nights/${n.id}/invitation`} body={{ reponse: 'absent' }} className="btn-absent"
                                label={t(lang, 'soiree.pasDispo')} pressed={n.etat === 'absent'} />
                </div>
                <p className="hint">{n.etat === 'absent' ? t(lang, 'soiree.reponduAbsent') : t(lang, 'soiree.pasRepondu')}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="qg-section" aria-label={t(lang, 'soiree.ceSoir')}>
        <h2>{t(lang, 'soiree.ceSoir')}</h2>
        {active ? (
          <ul className="nights-list">
            <li className="night-card live">
              <div className="night-card-head">
                {active.status === 'en_jeu'
                  ? <span className="badge-etat b-enjeu"><span className="pt" />{t(lang, 'etagere.enJeu')}</span>
                  : <span className="badge-etat b-prep"><span className="pt" />{t(lang, 'etagere.enPrep')}</span>}
                {active.creator_id === user.id && <TerminerNight nightId={active.id} status={active.status} />}
              </div>
              <div className="chips">
                {getNightPlayers(active.id).map((p) => <PlayerChip key={p.id} u={p} />)}
              </div>
              {activeGame && <p className="jeu-partie">{t(lang, 'soiree.jeuPartie', { j: activeGame.title })}</p>}
              <div className="lien-actions">
                <a className="btn-copper as-link" href="/etagere">{t(lang, 'soiree.ouvrirEtagere')}</a>
                {active.creator_id === user.id && active.status === 'creation' && (() => {
                  const ps = getNightPlayers(active.id);
                  return <InviteButton label={t(lang, 'soiree.inviter')} lien={lienInvitation(active)} titre={active.titre}
                                       dateLong={dateLongue(active.played_at)} time={heureCourte(active.played_at, active.start_time)}
                                       pseudos={ps.map((p) => p.pseudo)} />;
                })()}
              </div>
            </li>
          </ul>
        ) : (
          <p className="empty">{t(lang, 'soiree.videAvant')}<a href="/etagere">{t(lang, 'soiree.videLien')}</a>{t(lang, 'soiree.videApres')}</p>
        )}
      </section>

      <section className="qg-section" aria-label={t(lang, 'soiree.programmees')}>
        <div className="qg-head">
          <h2>{t(lang, 'soiree.programmees')}</h2>
          <NightPlanner users={users} meId={user.id} cercles={cercles} />
        </div>
        {planned.length === 0 ? (
          <p className="empty">{t(lang, 'soiree.aucuneProgrammee')}</p>
        ) : (
          <ul className="nights-list">
            {planned.map((n) => {
              const players = getNightPlayers(n.id);
              const invitesLien = players.filter((p) => p.est_invite);
              const invites = invitesNuit(n.id); // v4.8.0 : invitations dans l'app et leurs réponses
              const nbJeux = getShelfGames(n.id).length;
              const { day, month } = dayMonth(n.played_at, lang);
              const createur = n.creator_id === user.id;
              return (
                <li key={n.id} className="night-card planned-card">
                  <div className="plan-date" aria-hidden="true">
                    <span className="plan-day">{day}</span>
                    <span className="plan-month">{month}</span>
                  </div>
                  <div className="plan-body">
                    <div className="plan-top">
                      <span className="plan-titre">{titrePartie(lang, n)}</span>
                      {createur && (
                        <SupprimerPartie nightId={n.id} date={dateLongue(n.played_at)} nbJeux={nbJeux}
                                         joueurs={players.filter((p) => !p.est_invite && p.id !== user.id).map((p) => p.pseudo)}
                                         invites={invitesLien.map((p) => p.pseudo)} />
                      )}
                    </div>
                    <div className="plan-when">
                      <span className="plan-long">{dateLongue(n.played_at)}</span>
                      {n.start_time && (
                        <span className="plan-time">{heureCourte(n.played_at, n.start_time)}</span>
                      )}
                    </div>
                    {invites.length > 0 && createur && (() => {
                      const nb = (e: string) => invites.filter((i) => i.etat === e).length;
                      return (
                        <div className="decompte">
                          <span className="d">{t(lang, 'soiree.decDispo', { n: nb('dispo') })}</span>
                          {nb('absent') > 0 && <span className="a">{t(lang, 'soiree.decAbsent', { n: nb('absent') })}</span>}
                          {nb('attente') > 0 && <span>{t(lang, 'soiree.decAttente', { n: nb('attente') })}</span>}
                        </div>
                      );
                    })()}
                    <div className="chips">
                      {players.map((p) => <PlayerChip key={p.id} u={p} />)}
                      {invites.filter((i) => i.etat !== 'dispo').map((i) => (
                        <span key={i.id} className={i.etat === 'absent' ? 'chip-absent' : 'chip-attente'}
                              aria-label={t(lang, i.etat === 'absent' ? 'soiree.absentAria' : 'soiree.sansReponse', { p: i.pseudo })}>
                          <PlayerChip u={i} etat={i.etat === 'attente' ? 'attente' : undefined} />
                        </span>
                      ))}
                    </div>
                    {createur && invites.filter((i) => i.etat === 'attente').map((i) => (
                      <BoutonAction key={i.id} url={`/api/nights/${n.id}/invitation`} body={{ userId: i.id }}
                                    className="link-btn" label={t(lang, 'soiree.inscrire', { p: i.pseudo })} />
                    ))}
                    <p className="plan-meta">{t(lang, 'soiree.nbJeuxEtagere', { n: nbJeux })}</p>
                    <div className="lien-actions">
                      <a className="btn-copper as-link" href={`/etagere?night=${n.id}`}>{t(lang, 'soiree.preparerEtagere')}</a>
                      <InviteButton
                        label={createur ? t(lang, 'soiree.inviter') : undefined}
                        titre={n.titre}
                        dateLong={dateLongue(n.played_at)}
                        time={heureCourte(n.played_at, n.start_time)}
                        pseudos={players.map((p) => p.pseudo)}
                        lien={createur ? lienInvitation(n) : undefined}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="qg-section" aria-label={t(lang, 'soiree.historique')}>
        <h2>{t(lang, 'soiree.historique')}</h2>
        <div className="hist-liste">
          {cartes.map((n) => {
            const cover = coverSrc({ cover_path: n.game_cover_path, cover_url: n.game_cover_url });
            return (
              <a key={n.id} className="hist-card" href={`/nights/${n.id}`}>
                {cover
                  ? <span className="cov hist-cov"><img src={cover} alt="" loading="lazy" decoding="async" /></span>
                  : <span className="cov hist-cov">🎲</span>}
                <span className="hc"><b>{n.game_title ?? t(lang, 'soiree.sansJeu')}</b>
                  <span className="gagnant">{n.gagnant_pseudo ? t(lang, 'soiree.gagnant', { p: n.gagnant_pseudo, s: n.gagnant_score as number }) : t(lang, 'soiree.pasDeScores')}</span></span>
                <span className="dt"><span>{dateLongue(n.played_at)}</span></span>
              </a>
            );
          })}
          {cartes.length === 0 && <p className="hint">{t(lang, 'soiree.aucuneTerminee')}</p>}
        </div>
      </section>
    </main>
  );
}
