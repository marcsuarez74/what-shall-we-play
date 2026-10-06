'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from './LanguageProvider';

// Le jeton d'invité vit sous wsp_night_<id> : restaurer la session silencieusement
// au retour sur le lien (leçon v4.5.0 — les cookies PWA meurent, pas localStorage).
// v4.7.0 : l'invitation s'affiche d'abord ; l'invité arrive sur SA soirée (/invite),
// un compte sur l'étagère de la partie (?night=) — y compris une partie programmée.
export default function RejoindreSoiree({ nightId, token, dejaConnecte, hote, titre, dateLong, time, nbJoueurs, nbJeux }: {
  nightId: number; token: string; dejaConnecte: boolean;
  hote: string; titre: string; dateLong: string; time: string | null; nbJoueurs: number; nbJeux: number;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [nom, setNom] = useState('');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const cle = `wsp_night_${nightId}`;
  const ici = `/nights/${nightId}/rejoindre?k=${token}`;

  useEffect(() => {
    const dt = localStorage.getItem(cle);
    if (!dt) return;
    fetch('/api/auth/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: dt }) })
      .then(async (r) => {
        if (r.status === 401) { localStorage.removeItem(cle); return; } // jeton inconnu seulement — une panne passagère ne déconnecte pas
        if (!r.ok) return;
        const data = await r.json();
        localStorage.setItem(cle, data.device_token); // rotation à chaque restauration
        router.replace('/invite');
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
    router.replace(data.mode === 'invite' ? '/invite' : `/etagere?night=${nightId}`);
  }

  return (
    <main className="join-page">
      <div className="join-hero" aria-hidden>🎲</div>
      <p className="join-invite"><b>{t('invite.tInvite', { hote })}</b> {t('invite.aUneSoiree')}</p>
      <h1 className="invite-h1">{titre}</h1>
      <p className="invite-date">{dateLong}{time ? ` · ${time}` : ''}</p>
      <p className="join-note">{t('invite.resume', { joueurs: nbJoueurs, jeux: nbJeux })}</p>
      {dejaConnecte ? (
        <>
          <p className="join-note">{t('soiree.joinAvecCompte')}</p>
          {erreur && <p role="alert" className="join-erreur">{erreur}</p>}
          <button type="button" className="btn-copper" disabled={busy} onClick={rejoindre}>{t('invite.rejoindreCompte')}</button>
        </>
      ) : (
        <>
          <label htmlFor="nom-invite">{t('soiree.joinNomLabel')}</label>
          <input id="nom-invite" type="text" value={nom} maxLength={20}
                 onChange={(e) => setNom(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter' && nom.trim() && !busy) rejoindre(); }} />
          {erreur && <p role="alert" className="join-erreur">{erreur}</p>}
          <button type="button" className="btn-copper" disabled={busy || nom.trim().length === 0} onClick={rejoindre}>
            {t('soiree.joinCta')}
          </button>
          <p className="join-note">{t('soiree.joinSansCompte')}</p>
          <p className="join-sep">{t('invite.dejaCompte')}</p>
          <a className="btn-ghost as-link" href={`/login?next=${encodeURIComponent(ici)}`}>{t('invite.connecterRejoindre')}</a>
        </>
      )}
    </main>
  );
}
