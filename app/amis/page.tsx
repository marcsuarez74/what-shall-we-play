// app/amis/page.tsx — v4.8.0 : onglet Amis. Trois sections (?s=) : mes amis (demandes,
// liste, ajout par pseudo, mon lien), mes cercles, l'activité de mes amis (30 jours).
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { getDb } from '@/lib/db';
import { listRelations, listAmis, listDemandesRecues, listDemandesEnvoyees, lienAmi, urlPublique } from '@/lib/amis';
import { mesCercles } from '@/lib/cercles';
import { activiteAmis } from '@/lib/invitations';
import { coverSrc } from '@/lib/formats';
import { t, type Lang } from '@/lib/i18n';
import { formatDate } from '@/lib/i18n/format';
import { getLang } from '@/lib/i18n/server';
import PlayerChip from '@/components/PlayerChip';
import UserMenu from '@/components/UserMenu';
import UserSync from '@/components/UserSync';
import BoutonAction from '@/components/BoutonAction';
import AjoutAmi from '@/components/AjoutAmi';
import NouveauCercle from '@/components/NouveauCercle';
import LienPartage from '@/components/LienPartage';

type Section = 'amis' | 'cercles' | 'activite';
const SECTIONS: { s: Section; label: 'amis.secAmis' | 'amis.secCercles' | 'amis.secActivite' }[] = [
  { s: 'amis', label: 'amis.secAmis' }, { s: 'cercles', label: 'amis.secCercles' }, { s: 'activite', label: 'amis.secActivite' },
];

export default async function Page({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const lang = await getLang();
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const demande = (await searchParams).s;
  const section: Section = demande === 'cercles' || demande === 'activite' ? demande : 'amis';
  return (
    <main className="page">
      <UserSync />
      <div className="page-head">
        <h1>{t(lang, 'amis.titre')}</h1>
        <UserMenu me={user} />
      </div>
      <nav className="amis-seg" aria-label={t(lang, 'amis.sections')}>
        {SECTIONS.map(({ s, label }) => (
          <a key={s} href={s === 'amis' ? '/amis' : `/amis?s=${s}`} aria-current={section === s ? 'page' : undefined}>{t(lang, label)}</a>
        ))}
      </nav>
      {section === 'amis' && <SectionAmis moi={user.id} lang={lang} />}
      {section === 'cercles' && <SectionCercles moi={user.id} lang={lang} />}
      {section === 'activite' && <SectionActivite moi={user.id} lang={lang} />}
    </main>
  );
}

function SectionAmis({ moi, lang }: { moi: number; lang: Lang }) {
  const recues = listDemandesRecues(moi);
  const envoyees = listDemandesEnvoyees(moi);
  const relations = listRelations(moi);
  const amis = new Set(listAmis(moi).map((a) => a.id));
  const db = getDb();
  const monFoyer = (db.prepare('SELECT foyer_id FROM users WHERE id = ?').get(moi) as { foyer_id: number | null }).foyer_id;
  const cerclesCommuns = db.prepare(`SELECT COUNT(*) AS n FROM cercle_membres a JOIN cercle_membres b ON b.cercle_id = a.cercle_id
    WHERE a.user_id = ? AND b.user_id = ? AND a.etat = 'membre' AND b.etat = 'membre'`);
  const foyerDe = db.prepare('SELECT foyer_id FROM users WHERE id = ?');
  const lien = urlPublique(`/ami?k=${lienAmi(moi)}`);
  return (
    <>
      {recues.length > 0 && (
        <section className="night-card rsvp" aria-label={t(lang, 'amis.demandes', { n: recues.length })}>
          <p className="sous-label">{t(lang, 'amis.demandes', { n: recues.length })}</p>
          {recues.map((u) => (
            <div key={u.id} className="demande">
              <p><PlayerChip u={u} /> {t(lang, 'amis.veutTAjouter', { p: '' }).trim()}</p>
              <div className="lien-actions">
                <BoutonAction url="/api/amis" method="PATCH" body={{ userId: u.id, accepter: true }} className="btn-copper" label={t(lang, 'amis.accepter')} />
                <BoutonAction url="/api/amis" method="PATCH" body={{ userId: u.id, accepter: false }} label={t(lang, 'amis.refuser')} />
              </div>
            </div>
          ))}
        </section>
      )}
      <section className="qg-section" aria-label={t(lang, 'amis.nbAmis', { n: relations.length })}>
        <h2>{t(lang, 'amis.nbAmis', { n: relations.length })}</h2>
        {relations.length === 0 && <p className="empty">{t(lang, 'amis.aucun')}</p>}
        <ul className="membres">
          {relations.map((u) => {
            const nb = (cerclesCommuns.get(moi, u.id) as { n: number }).n;
            const foyer = monFoyer !== null && (foyerDe.get(u.id) as { foyer_id: number | null }).foyer_id === monFoyer;
            const infos = [foyer && t(lang, 'amis.foyer'), nb > 0 && t(lang, 'amis.nbCercles', { n: nb })].filter(Boolean).join(' · ');
            return (
              <li key={u.id} className="membre">
                <PlayerChip u={u} />
                {infos && <span className="role">{infos}</span>}
                {amis.has(u.id) && (
                  <BoutonAction url="/api/amis" method="DELETE" body={{ userId: u.id }} className="retirer"
                                label="✕" ariaLabel={t(lang, 'amis.retirerAria', { p: u.pseudo })} confirmer={t(lang, 'amis.sur')} />
                )}
              </li>
            );
          })}
        </ul>
      </section>
      {envoyees.length > 0 && (
        <section className="qg-section" aria-label={t(lang, 'amis.envoyees')}>
          <p className="sous-label">{t(lang, 'amis.envoyees')}</p>
          <ul className="membres">
            {envoyees.map((u) => (
              <li key={u.id} className="membre">
                <PlayerChip u={u} /><span className="role">{t(lang, 'amis.enAttente')}</span>
                <BoutonAction url="/api/amis" method="DELETE" body={{ userId: u.id }} className="link-btn" label={t(lang, 'amis.annuler')} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <AjoutAmi />
      <LienPartage titre={t(lang, 'amis.monLien')} aide={t(lang, 'amis.lienAide')} lien={lien} message={t(lang, 'amis.lienMessage', { lien })} />
    </>
  );
}

function SectionCercles({ moi, lang }: { moi: number; lang: Lang }) {
  const cercles = mesCercles(moi);
  return (
    <>
      {cercles.length === 0 && <p className="empty">{t(lang, 'cercles.aucun')}</p>}
      <ul className="nights-list">
        {cercles.map((c) => (
          <li key={c.id}>
            <a className="night-card cercle-card" href={`/amis/cercles/${c.id}`}>
              <span className="cercle-ico" aria-hidden="true">🎲</span>
              <span className="cercle-body">
                <b>{c.nom}</b>
                <span className="hint">{t(lang, 'cercles.nbMembres', { n: c.nb })}{c.role === 'admin' && ` · ${t(lang, 'cercles.tuEsAdmin')}`}</span>
              </span>
              <span className="avatars" aria-hidden="true">{c.apercu.map((s, i) => <span key={i}>{s}</span>)}</span>
            </a>
          </li>
        ))}
      </ul>
      <NouveauCercle />
    </>
  );
}

function SectionActivite({ moi, lang }: { moi: number; lang: Lang }) {
  const activite = activiteAmis(moi);
  if (activite.length === 0) return <p className="empty">{t(lang, 'amis.activiteVide')}</p>;
  return (
    <>
      <div className="hist-liste activite">
        {activite.map((a) => {
          const cover = coverSrc({ cover_path: a.cover_path, cover_url: a.cover_url });
          const noms = a.amis.slice(0, 2);
          const jeu = a.game_title ?? t(lang, 'soiree.sansJeu');
          const v = [a.verdicts.adore && `😍 ${a.verdicts.adore}`, a.verdicts.bien && `🙂 ${a.verdicts.bien}`, a.verdicts.neutre && `😐 ${a.verdicts.neutre}`].filter(Boolean).join(' · ');
          return (
            <div key={a.id} className="hist-card">
              <span className="cov hist-cov">{cover ? <img src={cover} alt="" loading="lazy" decoding="async" /> : '🎲'}</span>
              <span className="hc">
                <b>{t(lang, 'amis.ontJoue', { noms: noms.join(', '), autres: a.nb - noms.length, j: jeu })}</b>
                <span className="gagnant">
                  {a.gagnant_pseudo ? t(lang, 'soiree.gagnant', { p: a.gagnant_pseudo, s: a.gagnant_score as number }) : t(lang, 'soiree.pasDeScores')}
                  {v && ` — ${v}`}
                </span>
              </span>
              <span className="dt"><span>{formatDate(lang, `${a.played_at}T12:00:00`, { weekday: 'long', day: 'numeric', month: 'long' })}</span></span>
            </div>
          );
        })}
      </div>
      <p className="hint">{t(lang, 'amis.activiteFin')}</p>
    </>
  );
}
