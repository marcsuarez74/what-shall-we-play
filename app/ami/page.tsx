// app/ami/page.tsx — v4.8.0 : lien d'ami reçu (?k=). Ouvert par un compte, il rend amis
// (partager son lien vaut accord) ; sans compte, on se connecte ou on en crée un, puis retour ici.
import { getSessionUser } from '@/lib/session';
import { proprietaireLienAmi, etatAmitie } from '@/lib/amis';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import BoutonAction from '@/components/BoutonAction';

export default async function Page({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
  const lang = await getLang();
  const { k } = await searchParams;
  const ami = proprietaireLienAmi(k);
  if (!ami) return <main className="join-page"><p className="join-erreur">{t(lang, 'amis.errLienInvalide')}</p></main>;
  const me = await getSessionUser();
  const ici = `/ami?k=${encodeURIComponent(k as string)}`;
  const deja = me && (me.id === ami.id || etatAmitie(me.id, ami.id) === 'ami');
  return (
    <main className="join-page lien-recu">
      <p className="grand-emoji" aria-hidden="true">🤝</p>
      <h1>{t(lang, 'amis.recuTitre', { p: ami.pseudo })}</h1>
      <p className="hint">{t(lang, 'amis.recuTexte')}</p>
      {deja ? (
        <>
          <p className="ok-msg">{me.id === ami.id ? t(lang, 'amis.errSoiMeme') : t(lang, 'amis.dejaAmis', { p: ami.pseudo })}</p>
          <a className="btn-copper as-link" href="/amis">{t(lang, 'amis.voirAmis')}</a>
        </>
      ) : me ? (
        <BoutonAction url="/api/amis/lien" body={{ k }} className="btn-copper" label={t(lang, 'amis.devenirAmis')} aller="/amis" />
      ) : (
        <>
          <a className="btn-copper as-link" href={`/login?next=${encodeURIComponent(ici)}`}>{t(lang, 'amis.meConnecter')}</a>
          <p className="hint">{t(lang, 'amis.pasDeCompte')}</p>
          <a className="btn-ghost as-link" href={`/register?next=${encodeURIComponent(ici)}`}>{t(lang, 'amis.creerCompte')}</a>
        </>
      )}
    </main>
  );
}
