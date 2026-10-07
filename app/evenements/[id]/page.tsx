// v4.15.0 — la page d'un événement : participants, jeux au programme (cochés tout seuls quand
// une partie de l'événement se termine dessus), parties rattachées, démarrer une partie.
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionUser } from '@/lib/session';
import { getEvenement, jeuxProgramme, mesEvenements, partiesEvenement } from '@/lib/evenements';
import { listUserLibrary } from '@/lib/games';
import { listRelations } from '@/lib/amis';
import { mesCercles, membresCercle } from '@/lib/cercles';
import { t } from '@/lib/i18n';
import { formatDate, titrePartie } from '@/lib/i18n/format';
import { getLang } from '@/lib/i18n/server';
import PlayerChip from '@/components/PlayerChip';
import NightPlanner from '@/components/NightPlanner';
import ProgrammeJeux from '@/components/ProgrammeJeux';
import BoutonAction from '@/components/BoutonAction';
import UserMenu from '@/components/UserMenu';
import UserSync from '@/components/UserSync';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const evt = getEvenement(Number((await params).id), user.id);
  if (!evt) notFound();
  const organisateur = evt.creator_id === user.id;
  const jeux = jeuxProgramme(evt.id);
  const parties = partiesEvenement(evt.id);
  const jour = (d: string) => formatDate(lang, `${d}T12:00:00`, { weekday: 'short', day: 'numeric', month: 'long' });
  const periode = evt.du && evt.au ? (evt.du === evt.au ? jour(evt.du) : `${jour(evt.du)} – ${jour(evt.au)}`) : t(lang, 'evt.datesADefinir');
  const joues = jeux.filter((j) => j.joue).length;
  const statut = (s: string) => t(lang, s === 'termine' ? 'evt.terminee' : s === 'en_jeu' ? 'etagere.enJeu' : 'etagere.enPrep');
  const users = [{ id: user.id, pseudo: user.pseudo, sticker: user.sticker, avatar_path: user.avatar_path }, ...listRelations(user.id)];
  const cercles = mesCercles(user.id).map((c) => ({ id: c.id, nom: c.nom, membres: membresCercle(c.id).filter((m) => m.etat === 'membre').map((m) => m.id) }));

  return (
    <main className="page evt-page">
      <UserSync />
      <div className="page-head">
        <Link className="link-btn" href="/nights?vue=evenements">{t(lang, 'evt.retour')}</Link>
        <UserMenu me={user} />
      </div>
      <section className="evt-hero">
        <h1>{evt.titre}</h1>
        <p className="meta">{periode}{evt.description ? ` · ${evt.description}` : ''}</p>
        {!organisateur && <p className="meta">{t(lang, 'evt.organisePar', { p: evt.hote_pseudo })}</p>}
        <div className="chips">{evt.participants.map((p) => <PlayerChip key={p.id} u={p} />)}</div>
      </section>

      <section className="qg-section" aria-label={t(lang, 'evt.auProgramme')}>
        <h2>{t(lang, 'evt.auProgramme')}</h2>
        <div className="night-card">
          {jeux.length === 0 ? <p className="hint">{t(lang, 'evt.programmeVide')}</p> : (
            <>
              <ul className="evt-jeux">
                {jeux.map((j) => (
                  <li key={j.game_id} className={j.joue ? 'joue' : ''}>
                    <span className="tick" aria-hidden="true">{j.joue ? '✓' : ''}</span>
                    <b>{j.title}</b><span className="meta">{t(lang, j.joue ? 'evt.jeuJoue' : 'evt.jeuAJouer')}</span>
                  </li>
                ))}
              </ul>
              <div className="prog" role="progressbar" aria-valuemin={0} aria-valuemax={jeux.length} aria-valuenow={joues}>
                <i style={{ width: `${Math.round((100 * joues) / jeux.length)}%` }} />
              </div>
              <p className="meta">{t(lang, 'evt.joues', { n: joues, total: jeux.length })}</p>
            </>
          )}
          {organisateur && <ProgrammeJeux evtId={evt.id} ludo={listUserLibrary(user.id).map((g) => ({ id: g.id, title: g.title }))}
                                          programme={jeux.map((j) => j.game_id)} />}
        </div>
      </section>

      <section className="qg-section" aria-label={t(lang, 'evt.parties')}>
        <h2>{t(lang, 'evt.parties')}</h2>
        <div className="night-card">
          {parties.length === 0 ? <p className="hint">{t(lang, 'evt.partiesVide')}</p> : (
            <ul className="serie-dates">
              {parties.map((p) => (
                <li key={p.id} className="serie-date">
                  <span className="d"><b>{titrePartie(lang, p)}</b>
                    <small>{jour(p.played_at)}{p.game_title ? ` · ${p.game_title}` : ''} · {p.joueurs.map((j) => j.pseudo).join(', ')}</small></span>
                  <span className="badge-etat b-prog"><span className="pt" />{statut(p.status)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <NightPlanner users={users} meId={user.id} cercles={cercles} quand="now" label={t(lang, 'evt.demarrer')}
                      evenements={mesEvenements(user.id).map((e) => ({ id: e.id, titre: e.titre }))} evenementId={evt.id} />
        <p className="hint">{t(lang, 'evt.aideEtagere')}</p>
      </section>

      {organisateur && (
        <BoutonAction url={`/api/evenements/${evt.id}`} method="DELETE" className="btn-ghost"
                      label={t(lang, 'evt.supprimer')} confirmer={t(lang, 'evt.supprimerConfirmer', { n: parties.length })}
                      aller="/nights?vue=evenements" />
      )}
    </main>
  );
}
