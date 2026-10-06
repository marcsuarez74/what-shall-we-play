'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from './LanguageProvider';

// v4.8.0 — créer un cercle (j'en deviens admin), puis on y ajoute ses amis.
export default function NouveauCercle() {
  const { t } = useI18n();
  const router = useRouter();
  const [nom, setNom] = useState('');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErreur(null);
    const r = await fetch('/api/cercles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nom }) });
    const data = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErreur(data.error ?? t('erreurs.impossible')); return; }
    router.push(`/amis/cercles/${data.id}`);
  }

  return (
    <form className="ajout-ami" onSubmit={creer}>
      <label htmlFor="nouveau-cercle" className="sous-label">{t('cercles.nouveau')}</label>
      <div className="ajout-ami-row">
        <input id="nouveau-cercle" type="text" value={nom} maxLength={40} aria-label={t('cercles.nomLabel')}
               placeholder={t('cercles.nomPlaceholder')} onChange={(e) => setNom(e.target.value)} />
        <button className="btn-copper" disabled={busy || !nom.trim()}>{t('cercles.creer')}</button>
      </div>
      {erreur && <p className="error" role="alert">{erreur}</p>}
    </form>
  );
}
