'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from './LanguageProvider';

// Le jeton d'invité vit sous wsp_night_<id> : restaurer la session silencieusement
// au retour sur le lien (leçon v4.5.0 — les cookies PWA meurent, pas localStorage).
export default function RejoindreSoiree({ nightId, token, dejaConnecte }: { nightId: number; token: string; dejaConnecte: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [nom, setNom] = useState('');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const cle = `wsp_night_${nightId}`;

  useEffect(() => {
    const dt = localStorage.getItem(cle);
    if (!dt) return;
    fetch('/api/auth/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device_token: dt }) })
      .then(async (r) => {
        if (!r.ok) { localStorage.removeItem(cle); return; }
        const data = await r.json();
        localStorage.setItem(cle, data.device_token); // rotation à chaque restauration
        router.replace('/etagere'); // l'écran vivant de la soirée (l'archive est /nights/<id>)
      })
      .catch(() => {}); // hors ligne : le formulaire reste affiché
  }, [cle, nightId, router]);

  async function rejoindre() {
    setBusy(true); setErreur(null);
    const r = await fetch(`/api/nights/${nightId}/rejoindre`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom, k: token }),
    });
    setBusy(false);
    if (!r.ok) { setErreur((await r.json().catch(() => ({}))).error ?? t('soiree.lienInvalide')); return; }
    const data = await r.json();
    if (data.device_token) localStorage.setItem(cle, data.device_token);
    router.replace('/etagere'); // l'écran vivant — cf. T8 ruling
  }

  return (
    <main className="join-page">
      <div className="join-hero" aria-hidden>🎲</div>
      {dejaConnecte && <p className="join-note">{t('soiree.joinAvecCompte')}</p>}
      <label htmlFor="nom-invite">{t('soiree.joinNomLabel')}</label>
      <input id="nom-invite" type="text" value={nom} maxLength={20}
             onChange={(e) => setNom(e.target.value)}
             onKeyDown={(e) => { if (e.key === 'Enter' && nom.trim() && !busy) rejoindre(); }} />
      {erreur && <p role="alert" className="join-erreur">{erreur}</p>}
      <button type="button" className="btn-copper" disabled={busy || nom.trim().length === 0} onClick={rejoindre}>
        {t('soiree.joinCta')}
      </button>
      <p className="join-note">{t('soiree.joinSansCompte')}</p>
    </main>
  );
}
