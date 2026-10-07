'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from './LanguageProvider';

// v4.14.0 — « Gérer la série » (créateur) : modifier titre / heure de toutes les dates à
// venir, ou arrêter la série. La confirmation d'arrêt LISTE ce qui part et ce qui reste
// (garde-fou AGENTS.md : jamais de suppression implicite).
export default function GererSerie({ serieId, titre, heure, supprimees, gardees }: {
  serieId: number; titre: string | null; heure: string | null; supprimees: number; gardees: number;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [vue, setVue] = useState<'ferme' | 'modifier' | 'arreter'>('ferme');
  const [nvTitre, setNvTitre] = useState(titre ?? '');
  const [nvHeure, setNvHeure] = useState(heure ?? '');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function appeler(method: 'PATCH' | 'DELETE', body?: unknown) {
    setBusy(true); setErreur(null);
    const r = await fetch(`/api/series/${serieId}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    setBusy(false);
    if (!r.ok) { setErreur((await r.json().catch(() => ({}))).error ?? t('erreurs.impossible')); return; }
    setVue('ferme');
    router.refresh();
  }

  if (vue === 'ferme') {
    return (
      <div className="lien-actions">
        <button type="button" className="btn-ghost" onClick={() => setVue('modifier')}>{t('serie.modifierTout')}</button>
        <button type="button" className="btn-ghost armed" onClick={() => setVue('arreter')}>{t('serie.arreter')}</button>
      </div>
    );
  }
  if (vue === 'modifier') {
    return (
      <div className="serie-gerer">
        <label className="plan-titre-field">{t('soiree.titreLabel')} <span className="opt">{t('soiree.facultatif')}</span>
          <input type="text" value={nvTitre} maxLength={40} onChange={(e) => setNvTitre(e.target.value)} />
        </label>
        <label className="plan-titre-field">{t('soiree.heure')} <span className="opt">{t('soiree.facultatif')}</span>
          <input type="time" value={nvHeure} onChange={(e) => setNvHeure(e.target.value)} />
        </label>
        {erreur && <p className="error" role="alert">{erreur}</p>}
        <div className="lien-actions">
          <button type="button" className="btn-ghost" onClick={() => setVue('ferme')}>{t('soiree.annuler')}</button>
          <button type="button" className="btn-copper" disabled={busy}
                  onClick={() => appeler('PATCH', { titre: nvTitre, startTime: nvHeure })}>{t('serie.appliquer')}</button>
        </div>
      </div>
    );
  }
  return (
    <div className="confirm-suppr" role="group" aria-label={t('serie.arreterTitre')}>
      <b>{t('serie.arreterTitre')}</b>
      <ul>
        <li>{t('serie.arretJouees')}</li>
        <li>{t('serie.arretSupprimees', { n: supprimees })}</li>
        {gardees > 0 && <li>{t('serie.arretGardees', { n: gardees })}</li>}
      </ul>
      {erreur && <p className="error" role="alert">{erreur}</p>}
      <div className="lien-actions">
        <button type="button" className="btn-ghost" onClick={() => setVue('ferme')}>{t('soiree.garder')}</button>
        <button type="button" className="btn-danger" disabled={busy} onClick={() => appeler('DELETE')}>{t('serie.arreterConfirmer')}</button>
      </div>
    </div>
  );
}
