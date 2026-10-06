// app/cercles/rejoindre/page.tsx — v4.8.0 : lien de cercle reçu (?k=). Adhésion libre : membre
// tout de suite ; sur validation : la demande attend un admin. Sans compte : connexion puis retour.
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { cercleParLien, membresCercle } from '@/lib/cercles';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import BoutonAction from '@/components/BoutonAction';

export default async function Page({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
  const lang = await getLang();
  const { k } = await searchParams;
  const cercle = cercleParLien(k);
  if (!cercle) return <main className="join-page"><p className="join-erreur">{t(lang, 'cercles.errLienInvalide')}</p></main>;
  const me = await getSessionUser();
  const membres = membresCercle(cercle.id);
  if (me && membres.some((m) => m.id === me.id)) redirect(`/amis/cercles/${cercle.id}`);
  const ici = `/cercles/rejoindre?k=${encodeURIComponent(k as string)}`;
  return (
    <main className="join-page lien-recu">
      <p className="grand-emoji" aria-hidden="true">🎲</p>
      <h1>{t(lang, 'cercles.invitation', { nom: cercle.nom })}</h1>
      <p className="hint">{t(lang, 'cercles.nbMembres', { n: membres.filter((m) => m.etat === 'membre').length })}
        {cercle.adhesion === 'validation' && ` · ${t(lang, 'cercles.validation')}`}</p>
      {me ? (
        <BoutonAction url="/api/cercles/rejoindre" body={{ k }} className="btn-copper" label={t(lang, 'cercles.rejoindre')}
                      aller={`/amis/cercles/${cercle.id}`} />
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
