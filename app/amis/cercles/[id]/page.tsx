// app/amis/cercles/[id]/page.tsx — v4.8.0 : un cercle. Tout membre voit la liste, ajoute ses
// amis (selon l'adhésion), partage le lien et peut quitter ; les admins valident les arrivées,
// nomment d'autres admins, retirent des membres, changent l'adhésion, suppriment le cercle.
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { getCercle, membresCercle, peutVoir } from '@/lib/cercles';
import { listRelations, urlPublique } from '@/lib/amis';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import PlayerChip from '@/components/PlayerChip';
import UserMenu from '@/components/UserMenu';
import UserSync from '@/components/UserSync';
import BoutonAction from '@/components/BoutonAction';
import LienPartage from '@/components/LienPartage';
import KijoukanGrille from '@/components/KijoukanGrille';
import NightPlanner from '@/components/NightPlanner';
import { mesCercles } from '@/lib/cercles';
import { carteCercle, grilleDe, HEURE_CRENEAU, meilleurCreneau, prochainesDates } from '@/lib/kijoukan';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const id = Number((await params).id);
  const cercle = Number.isInteger(id) ? getCercle(id) : null;
  if (!cercle || !peutVoir(id, user.id)) redirect('/amis?s=cercles');
  const membres = membresCercle(id);
  const moi = membres.find((m) => m.id === user.id)!;
  const admin = moi.etat === 'membre' && moi.role === 'admin';
  const actifs = membres.filter((m) => m.etat === 'membre');
  const attente = membres.filter((m) => m.etat === 'attente');
  const pseudo = (uid: number | null) => membres.find((m) => m.id === uid)?.pseudo;
  const candidats = listRelations(user.id).filter((u) => !membres.some((m) => m.id === u.id));
  const api = `/api/cercles/${id}`;
  const lien = urlPublique(`/cercles/rejoindre?k=${cercle.lien_token}`);

  return (
    <main className="page">
      <UserSync />
      <div className="page-head">
        <a className="link-btn" href="/amis?s=cercles">{t(lang, 'cercles.retour')}</a>
        <UserMenu me={user} />
      </div>
      <div className="cercle-card">
        <span className="cercle-ico" aria-hidden="true">🎲</span>
        <span className="cercle-body">
          <h1 className="cercle-nom">{cercle.nom}</h1>
          <span className="hint">{t(lang, 'cercles.nbMembres', { n: actifs.length })}{admin && ` · ${t(lang, 'cercles.tuEsAdmin')}`}</span>
        </span>
      </div>

      {moi.etat === 'attente' ? (
        <p className="bandeau">{t(lang, 'cercles.demandeEnvoyee')}</p>
      ) : (
        <>
          {admin && (
            <section className="night-card" aria-label={t(lang, 'cercles.adhesion')}>
              <p className="sous-label">{t(lang, 'cercles.adhesion')}</p>
              <div className="adhesion">
                <BoutonAction url={api} method="PATCH" body={{ adhesion: 'libre' }} className="adhesion-opt"
                              pressed={cercle.adhesion === 'libre'} label={`${t(lang, 'cercles.libre')} — ${t(lang, 'cercles.libreAide')}`} />
                <BoutonAction url={api} method="PATCH" body={{ adhesion: 'validation' }} className="adhesion-opt"
                              pressed={cercle.adhesion === 'validation'} label={`${t(lang, 'cercles.validation')} — ${t(lang, 'cercles.validationAide')}`} />
              </div>
            </section>
          )}

          {admin && attente.length > 0 && (
            <section className="night-card rsvp" aria-label={t(lang, 'cercles.demandes')}>
              <p className="sous-label">{t(lang, 'cercles.demandes')}</p>
              {attente.map((m) => (
                <div key={m.id} className="demande">
                  <p><PlayerChip u={m} /> {m.ajoute_par && pseudo(m.ajoute_par) && <span className="hint">({t(lang, 'cercles.ajoutePar', { p: pseudo(m.ajoute_par)! })})</span>}</p>
                  <div className="lien-actions">
                    <BoutonAction url={`${api}/membres`} method="PATCH" body={{ userId: m.id, accepter: true }} className="btn-copper" label={t(lang, 'cercles.valider')} />
                    <BoutonAction url={`${api}/membres`} method="PATCH" body={{ userId: m.id, accepter: false }} label={t(lang, 'amis.refuser')} />
                  </div>
                </div>
              ))}
            </section>
          )}

          {(() => {
            // v4.16.0 — Kijoukan : la semaine type des membres, et le meilleur créneau en un geste.
            const carte = carteCercle(id);
            const best = meilleurCreneau(carte.compte);
            const joursLongs = t(lang, 'kij.joursLongs').split(',');
            const nomCase = (i: number) => `${joursLongs[i % 7]} ${t(lang, i < 7 ? 'kij.midiCourt' : 'kij.soirCourt')}`;
            const users = [{ id: user.id, pseudo: user.pseudo, sticker: user.sticker, avatar_path: user.avatar_path }, ...listRelations(user.id)];
            const cercles = mesCercles(user.id).map((c) => ({ id: c.id, nom: c.nom, membres: membresCercle(c.id).filter((m) => m.etat === 'membre').map((m) => m.id) }));
            return (
              <section className="night-card" aria-label={t(lang, 'kij.titre')}>
                <p className="sous-label">{t(lang, 'kij.titre')}</p>
                <KijoukanGrille grille={grilleDe(user.id)} compte={carte.compte} noms={carte.noms} membres={carte.membres} />
                <p className="hint">{t(lang, 'kij.aide')}</p>
                <p className="hint">{carte.repondu === 0 ? t(lang, 'kij.aucun') : t(lang, 'kij.repondu', { n: carte.repondu, total: carte.membres })}</p>
                {best !== null && (
                  <>
                    <p className="kij-best">{t(lang, 'kij.meilleur', { c: nomCase(best), n: carte.compte[best], total: carte.membres })}</p>
                    <NightPlanner users={users} meId={user.id} cercles={cercles} quand="plus" label={t(lang, 'kij.proposer', { c: nomCase(best) })}
                                  datesInit={prochainesDates(best % 7, 3).map((date) => ({ date, time: HEURE_CRENEAU[best < 7 ? 0 : 1] }))}
                                  cerclesInit={[id]} />
                  </>
                )}
              </section>
            );
          })()}

          <section className="qg-section" aria-label={t(lang, 'cercles.membres')}>
            <p className="sous-label">{t(lang, 'cercles.membres')}</p>
            <ul className="membres">
              {actifs.map((m) => (
                <li key={m.id} className="membre">
                  <PlayerChip u={m} />
                  {m.role === 'admin' && <span className="role">{t(lang, 'cercles.admin')}</span>}
                  {admin && m.id !== user.id && (
                    <>
                      <BoutonAction url={`${api}/membres`} method="PATCH" body={{ userId: m.id, role: m.role === 'admin' ? 'membre' : 'admin' }}
                                    className="link-btn" label={t(lang, m.role === 'admin' ? 'cercles.retirerAdmin' : 'cercles.nommerAdmin')} />
                      <BoutonAction url={`${api}/membres`} method="DELETE" body={{ userId: m.id }} className="retirer" label="✕"
                                    ariaLabel={t(lang, 'cercles.retirerAria', { p: m.pseudo })} confirmer={t(lang, 'amis.sur')} />
                    </>
                  )}
                </li>
              ))}
              {!admin && attente.map((m) => (
                <li key={m.id} className="membre"><PlayerChip u={m} etat="attente" /><span className="role">{t(lang, 'amis.enAttente')}</span></li>
              ))}
            </ul>
          </section>

          <details className="ajout-membres">
            <summary className="link-btn">{t(lang, 'cercles.ajouterAmis')}</summary>
            {candidats.length === 0 ? <p className="hint">{t(lang, 'cercles.tousLa')}</p> : (
              <ul className="membres">
                {candidats.map((u) => (
                  <li key={u.id} className="membre">
                    <PlayerChip u={u} />
                    <BoutonAction url={`${api}/membres`} body={{ userId: u.id }} className="btn-ghost sm" label={t(lang, 'cercles.ajouter')}
                                  ariaLabel={`${t(lang, 'cercles.ajouter')} ${u.pseudo}`} />
                  </li>
                ))}
              </ul>
            )}
          </details>

          <LienPartage titre={t(lang, 'cercles.lien')} lien={lien} message={t(lang, 'cercles.lienMessage', { nom: cercle.nom, lien })} />
        </>
      )}

      <div className="cercle-fin">
        <BoutonAction url={`${api}/membres`} method="DELETE" body={{ userId: user.id }} label={t(lang, 'cercles.quitter')}
                      confirmer={t(lang, 'amis.sur')} aller="/amis?s=cercles" />
        {admin && (
          <BoutonAction url={api} method="DELETE" className="btn-ghost danger" label={t(lang, 'cercles.supprimer')}
                        confirmer={t(lang, 'cercles.supprimerTexte', { nom: cercle.nom })} aller="/amis?s=cercles" />
        )}
      </div>
    </main>
  );
}
