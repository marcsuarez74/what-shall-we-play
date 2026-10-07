'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from './LanguageProvider';
import BoutonAction from './BoutonAction';

// v4.10.0 — l'organisateur voit qui est dispo quel soir, et retient un ou plusieurs soirs
// (une partie programmée par soir). La meilleure date est cochée d'avance.
type Personne = { id: number; pseudo: string; sticker?: string | null; repondu: boolean };
export default function SondageOrganise({ id, titre, dates, gens }: {
  id: number; titre: string;
  dates: { id: number; court: string; long: string; dispos: number[] }[];
  gens: Personne[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const meilleur = dates.reduce((a, b) => (b.dispos.length > a.dispos.length ? b : a), dates[0]);
  const [retenues, setRetenues] = useState<Set<number>>(() => new Set([meilleur.id]));
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const nbRepondu = gens.filter((g) => g.repondu).length - 1; // l'organisateur compte d'office

  function basculer(dateId: number) {
    setRetenues((s) => { const n = new Set(s); if (n.has(dateId)) n.delete(dateId); else n.add(dateId); return n; });
  }
  async function retenir() {
    setBusy(true); setErreur(null);
    const r = await fetch(`/api/sondages/${id}/retenir`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dateIds: [...retenues] }),
    });
    setBusy(false);
    if (!r.ok) { setErreur((await r.json().catch(() => ({}))).error ?? t('erreurs.impossible')); return; }
    router.refresh();
  }
  const choix = dates.filter((d) => retenues.has(d.id));

  return (
    <li className="night-card sondage-card">
      <div className="plan-top">
        <span className="plan-titre">{titre}</span>
        <span className="badge-etat b-prep"><span className="pt" />{t('sondage.nbRepondu', { r: nbRepondu, n: gens.length - 1 })}</span>
      </div>
      <p className="hint">{t('sondage.retenirAide')}</p>
      <div className="grille-wrap">
        <table className="grille">
          <thead><tr><th />{dates.map((d) => <th key={d.id} scope="col">{d.court}</th>)}</tr></thead>
          <tbody>
            {gens.map((g) => (
              <tr key={g.id}>
                <th scope="row">{g.sticker ?? '🎲'} {g.pseudo}{!g.repondu && ' ⏳'}</th>
                {dates.map((d) => (
                  <td key={d.id} className={d.dispos.includes(g.id) ? 'ok' : 'no'}>
                    {d.dispos.includes(g.id) ? '✓' : g.repondu ? '—' : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><th scope="row">{t('sondage.dispoLigne')}</th>{dates.map((d) => <td key={d.id} className={d.id === meilleur.id ? 'best' : ''}>{d.dispos.length}</td>)}</tr>
            <tr>
              <th scope="row">{t('sondage.retenir')}</th>
              {dates.map((d) => (
                <td key={d.id}>
                  <input type="checkbox" checked={retenues.has(d.id)} aria-label={t('sondage.retenirAria', { date: d.long })} onChange={() => basculer(d.id)} />
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <button type="button" className="btn-copper" disabled={busy || choix.length === 0} onClick={retenir}>
        {choix.length === 0 ? t('sondage.cocherUnSoir') : t('sondage.programmerN', { n: choix.length })}
      </button>
      <p className="hint">{t('sondage.retenirExplique')}</p>
      {erreur && <p className="error" role="alert">{erreur}</p>}
      <div className="lien-actions">
        <BoutonAction url={`/api/sondages/${id}`} method="DELETE" className="btn-ghost danger" label={t('sondage.supprimer')} confirmer={t('sondage.supprimerSur')} />
      </div>
    </li>
  );
}
