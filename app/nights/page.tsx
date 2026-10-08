import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionUser } from '@/lib/session';
import { getActiveNight, getPlannedNights, getHistoryCards, getNightPlayers, getNightGame, getShelfGames, lienInvitation, conflitHoraire } from '@/lib/nights';
import { bilanArret, completerSeries, mesSeries } from '@/lib/series';
import GererSerie from '@/components/GererSerie';
import NouvelEvenement from '@/components/NouvelEvenement';
import { mesEvenements } from '@/lib/evenements';
import { listRelations } from '@/lib/amis';
import { mesCercles, membresCercle } from '@/lib/cercles';
import { mesInvitations, invitesNuit, listeAttente } from '@/lib/invitations';
import { sondagesInvite, sondagesOrganises } from '@/lib/sondages';
import SondageOrganise from '@/components/SondageOrganise';
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
import { resumeLibre } from '@/lib/libre';

// « 2026-10-02 » → jour « 2 » + mois « oct. » — la date est le héros d'une carte programmée.
function dayMonth(playedAt: string, lang: Lang): { day: string; month: string } {
  return {
    day: String(Number(playedAt.split('-')[2])),
    month: formatDate(lang, `${playedAt}T12:00:00`, { month: 'short' }).replace('.', ''),
  };
}

export default async function Page({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const vueEvenements = (await searchParams).vue === 'evenements';
  completerSeries(); // v4.14.0 : 4 dates d'avance par série (idempotent, sans tâche dédiée)
  const active = getActiveNight(user.id);
  // v4.14.0 : les dates d'une série vivent dans la carte de la série, pas une à une.
  const planned = getPlannedNights(user.id).filter((n) => n.serie_id == null);
  const series = mesSeries(user.id);
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
  const evenements = mesEvenements(user.id); // v4.15.0
  // v4.10.0 : sondages de dates reçus (à cocher) et organisés (à trancher).
  const sondagesRecus = sondagesInvite(user.id);
  const sondagesMiens = sondagesOrganises(user.id);
  const dateSondage = (d: { played_at: string; start_time: string | null }, court = false) =>
    formatDate(lang, `${d.played_at}T${d.start_time ?? '12:00'}`, court
      ? { weekday: 'short', day: 'numeric' }
      : d.start_time ? { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' } : { weekday: 'short', day: 'numeric', month: 'long' });
  // Dates longues / heures des cartes programmées, dans la langue du cookie.
  const dateLongue = (playedAt: string) => formatDate(lang, `${playedAt}T12:00:00`, { dateStyle: 'long' });
  const heureCourte = (playedAt: string, start: string | null | undefined) =>
    start ? formatDate(lang, `${playedAt}T${start}`, { timeStyle: 'short' }) : null;
  // v4.14.0 — conflit d'horaire : on alerte, on n'empêche jamais.
  const alerteConflit = (n: { id: number; played_at: string; start_time?: string | null }) => {
    const c = conflitHoraire(user.id, n);
    return c && <p className="conflit">{t(lang, 'serie.conflit', { t: titrePartie(lang, c), h: heureCourte(c.played_at, c.start_time) ?? '' })}</p>;
  };

  return (
    <main className="page">
      {/* v4.7.0 : un invité qui rejoint, une partie supprimée — la page suit en direct */}
      <UserSync />
      <div className="page-head">
        <h1>{t(lang, 'soiree.titre')}</h1>
        <UserMenu me={user} />
      </div>
      {/* v4.15.0 — sous-onglets : la barre du bas garde 5 onglets */}
      <nav className="vue-seg" aria-label={t(lang, 'evt.titre')}>
        <Link href="/nights" aria-current={vueEvenements ? undefined : 'page'}>{t(lang, 'evt.ongletParties')}</Link>
        <Link href="/nights?vue=evenements" aria-current={vueEvenements ? 'page' : undefined}>
          {t(lang, 'evt.titre')}{evenements.length > 0 ? ` · ${evenements.length}` : ''}
        </Link>
      </nav>
      {vueEvenements ? (
        <section className="qg-section" aria-label={t(lang, 'evt.titre')}>
          <div className="qg-head">
            <h2>{t(lang, 'evt.titre')}</h2>
            <NouvelEvenement users={users} cercles={cercles} meId={user.id} />
          </div>
          {evenements.length === 0 ? <p className="empty">{t(lang, 'evt.vide')}</p> : (
            <ul className="nights-list">
              {evenements.map((e) => {
                const jour = (d: string) => formatDate(lang, `${d}T12:00:00`, { day: 'numeric', month: 'short' });
                return (
                  <li key={e.id}>
                    <Link className="night-card evt-card" href={`/evenements/${e.id}`}>
                      <span className="plan-top"><span className="plan-titre">{e.titre}</span>
                        <span className="badge-etat b-prep"><span className="pt" />{t(lang, e.nb_jeux > 0 && e.nb_joues === e.nb_jeux ? 'evt.badgeTermine' : 'evt.badgeEnCours')}</span></span>
                      <span className="meta">{e.du && e.au ? `${jour(e.du)} – ${jour(e.au)}` : t(lang, 'evt.datesADefinir')} · {t(lang, 'evt.nParticipants', { n: e.nb_participants })} · {t(lang, 'evt.nParties', { n: e.nb_parties })}</span>
                      {e.nb_jeux > 0 && <span className="prog"><i style={{ width: `${Math.round((100 * e.nb_joues) / e.nb_jeux)}%` }} /></span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : (<>

      {(invitations.length > 0 || sondagesRecus.length > 0) && (
        <section className="qg-section" aria-label={t(lang, 'soiree.invitations')}>
          <BandeauNotifications />
          <h2>{t(lang, 'soiree.invitations')}</h2>
          <ul className="nights-list">
            {sondagesRecus.map((sd) => {
              const titre = sd.titre ?? t(lang, 'sondage.sansTitre');
              return (
                <li key={`s${sd.id}`} className="night-card rsvp sondage-card" aria-label={titre}>
                  <div className="plan-top">
                    <span className="plan-titre">{titre}</span>
                    <span className="badge-etat b-prep"><span className="pt" />{t(lang, 'sondage.badge')}</span>
                  </div>
                  <p className="rsvp-qui">
                    <PlayerChip u={sd.hote} />{' '}
                    {[t(lang, 'sondage.demande'), sd.via_nom && t(lang, 'soiree.viaCercle', { nom: sd.via_nom }),
                      t(lang, 'soiree.nbInvites', { n: sd.invites.length }),
                      t(lang, 'sondage.nbRepondu', { r: sd.invites.filter((i) => i.repondu).length, n: sd.invites.length })].filter(Boolean).join(' · ')}
                  </p>
                  {sd.dates.map((d) => {
                    const moi = sd.mesDispos.includes(d.id);
                    return (
                      <div key={d.id} className="vote-date">
                        <span className="d"><b>{dateSondage(d)}</b>
                          <small>{t(lang, 'sondage.qui', { noms: d.dispos.map((u) => u.pseudo).join(', ') })}</small></span>
                        <BoutonAction url={`/api/sondages/${sd.id}/reponse`} body={{ dateId: d.id, dispo: !moi }} className="btn-dispo-date"
                                      pressed={moi} label={t(lang, 'sondage.dispo')} ariaLabel={t(lang, 'sondage.dispoAria', { date: dateSondage(d) })} />
                      </div>
                    );
                  })}
                  <p className="hint">{sd.invites.find((i) => i.id === user.id)?.repondu ? t(lang, 'sondage.repondu') : t(lang, 'sondage.aideReponse')}</p>
                </li>
              );
            })}
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
                {alerteConflit(n)}
                {(() => {
                  // v4.14.1 : partie complète → « Dispo » met en liste d'attente.
                  const pris = n.places_max != null ? getNightPlayers(n.id).length : 0;
                  return n.rang_liste != null
                    ? <p className="liste-info">{t(lang, 'liste.rang', { n: n.rang_liste })}</p>
                    : n.places_max != null && pris >= n.places_max
                      ? <p className="liste-info">{t(lang, 'liste.complet', { p: pris, max: n.places_max })}</p>
                      : null;
                })()}
                <div className="rsvp-btns">
                  <BoutonAction url={`/api/nights/${n.id}/invitation`} body={{ reponse: 'dispo' }} className="btn-dispo"
                                pressed={n.rang_liste != null}
                                label={n.rang_liste != null ? t(lang, 'liste.enListe')
                                  : n.places_max != null && getNightPlayers(n.id).length >= n.places_max ? t(lang, 'liste.mettreEnAttente') : t(lang, 'soiree.dispo')} />
                  <BoutonAction url={`/api/nights/${n.id}/invitation`} body={{ reponse: 'absent' }} className="btn-absent"
                                label={t(lang, 'soiree.pasDispo')} pressed={n.etat === 'absent'} />
                </div>
                <p className="hint">{n.etat === 'absent' ? t(lang, 'soiree.reponduAbsent') : t(lang, 'soiree.pasRepondu')}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sondagesMiens.length > 0 && (
        <section className="qg-section" aria-label={t(lang, 'sondage.sondages')}>
          <h2>{t(lang, 'sondage.sondages')}</h2>
          <ul className="nights-list">
            {sondagesMiens.map((sd) => (
              <SondageOrganise key={sd.id} id={sd.id} titre={sd.titre ?? t(lang, 'sondage.sansTitre')}
                dates={sd.dates.map((d) => ({ id: d.id, court: dateSondage(d, true), long: dateSondage(d), dispos: d.dispos.map((u) => u.id) }))}
                gens={[{ id: sd.hote.id, pseudo: sd.hote.pseudo, sticker: sd.hote.sticker, repondu: true },
                  ...sd.invites.map((i) => ({ id: i.id, pseudo: i.pseudo, sticker: i.sticker, repondu: i.repondu }))]} />
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

      {series.length > 0 && (
        <section className="qg-section" aria-label={t(lang, 'serie.titre')}>
          <h2>{t(lang, 'serie.titre')}</h2>
          <ul className="nights-list">
            {series.map((s) => {
              const createur = s.creator_id === user.id;
              const titre = s.titre ?? t(lang, 'serie.sansTitre');
              return (
                <li key={s.id} className="night-card serie-card" aria-label={titre}>
                  <div className="plan-top">
                    <span className="plan-titre">🔁 {titre}</span>
                    <span className="badge-etat b-prog"><span className="pt" />{t(lang, s.pas === 1 ? 'serie.chaqueSemaine' : 'serie.deuxSemaines')}{s.start_time ? ` · ${heureCourte(s.dates[0].played_at, s.start_time)}` : ''}</span>
                  </div>
                  {!createur && <p className="rsvp-qui">{t(lang, 'serie.par', { p: s.hote_pseudo })}</p>}
                  <ul className="serie-dates">
                    {s.dates.map((d) => (
                      <li key={d.id} className="serie-date">
                        <span className="d"><b>{dateSondage(d)}</b>
                          <small>{d.places_max != null ? t(lang, 'liste.places', { p: d.nb_joueurs, max: d.places_max }) : t(lang, 'etagere.nbJoueurs', { n: d.nb_joueurs })}
                            {d.rang_liste != null && ` · ${t(lang, 'liste.rangCourt', { n: d.rang_liste })}`}</small></span>
                        {d.etat !== 'createur' && (
                          <BoutonAction url={`/api/nights/${d.id}/invitation`} body={{ reponse: d.etat === 'dispo' ? 'absent' : 'dispo' }}
                                        className="btn-dispo-date" pressed={d.etat === 'dispo'}
                                        label={t(lang, d.etat === 'dispo' ? 'serie.dispo' : d.etat === 'absent' ? 'serie.absent' : 'serie.dispoQ')}
                                        ariaLabel={t(lang, 'sondage.dispoAria', { date: dateSondage(d) })} />
                        )}
                        {(createur || d.etat === 'dispo') && (
                          <a className="link-btn" href={`/etagere?night=${d.id}`}>{t(lang, 'serie.etagere')}</a>
                        )}
                        {d.conflit && <p className="conflit">{t(lang, 'serie.conflit', { t: titrePartie(lang, d.conflit), h: heureCourte(d.conflit.played_at, d.conflit.start_time) ?? '' })}</p>}
                      </li>
                    ))}
                  </ul>
                  {createur
                    ? <GererSerie serieId={s.id} titre={s.titre} heure={s.start_time} {...bilanArret(s.id)} />
                    : s.dates.some((d) => d.etat !== 'dispo') && (
                        <BoutonAction url={`/api/series/${s.id}/dispo`} className="btn-ghost" label={t(lang, 'serie.dispoToutes')} />
                      )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="qg-section" aria-label={t(lang, 'soiree.programmees')}>
        <div className="qg-head">
          <h2>{t(lang, 'soiree.programmees')}</h2>
          <NightPlanner users={users} meId={user.id} cercles={cercles} evenements={evenements.map((e) => ({ id: e.id, titre: e.titre }))} />
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
                    {alerteConflit(n)}
                    {invites.length > 0 && createur && (() => {
                      const nb = (e: string) => invites.filter((i) => i.etat === e).length;
                      return (
                        <div className="decompte">
                          <span className="d">{t(lang, 'soiree.decDispo', { n: nb('dispo') })}</span>
                          {nb('absent') > 0 && <span className="a">{t(lang, 'soiree.decAbsent', { n: nb('absent') })}</span>}
                          {nb('attente') > 0 && <span>{t(lang, 'soiree.decAttente', { n: nb('attente') })}</span>}
                          {n.places_max != null && <span>{t(lang, 'liste.places', { p: players.length, max: n.places_max })}</span>}
                          {listeAttente(n.id).length > 0 && <span>{t(lang, 'liste.decListe', { n: listeAttente(n.id).length })}</span>}
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
                      {/* v4.11.0 : fichier .ics (lien simple, zéro JavaScript) */}
                      <a className="btn-ghost as-link" href={`/api/nights/${n.id}/ics`} download>
                        {t(lang, 'soiree.ajouterCalendrier')}
                      </a>
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
                {n.mode === 'libre' ? (() => { // v4.19.0 : « N jeux · M manches » + gagnant(s) de la partie
                  const r = resumeLibre(n.id);
                  const tete = r.podium.filter((x) => x.rank === 1);
                  return <span className="hc"><b>{t(lang, 'libre.libre')} · {t(lang, 'libre.resume', { j: r.jeux, m: r.manches })}</b>
                    <span className="gagnant">{tete.length ? t(lang, 'libre.gagnant', { p: tete.map((x) => x.pseudo).join(' & '), v: tete[0].victoires }) : t(lang, 'soiree.pasDeScores')}</span></span>;
                })() : <span className="hc"><b>{n.game_title ?? t(lang, 'soiree.sansJeu')}</b>
                  <span className="gagnant">{n.gagnant_pseudo ? t(lang, 'soiree.gagnant', { p: n.gagnant_pseudo, s: n.gagnant_score as number }) : t(lang, 'soiree.pasDeScores')}</span></span>}
                <span className="dt"><span>{dateLongue(n.played_at)}</span></span>
              </a>
            );
          })}
          {cartes.length === 0 && <p className="hint">{t(lang, 'soiree.aucuneTerminee')}</p>}
        </div>
      </section>
      </>)}
    </main>
  );
}
