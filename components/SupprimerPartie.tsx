'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from './LanguageProvider';
import { frJoin } from '@/lib/announce';

// v4.7.0 — supprimer une partie programmée (créateur) : la confirmation liste ce
// qui disparaît avant d'agir (garde-fou AGENTS.md : jamais de suppression implicite).
export default function SupprimerPartie({ nightId, date, joueurs, invites, nbJeux }: {
  nightId: number; date: string; joueurs: string[]; invites: string[]; nbJeux: number;
}) {
  const { lang, t } = useI18n();
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function supprimer() {
    setBusy(true); setErreur(null);
    const r = await fetch(`/api/nights/${nightId}`, { method: 'DELETE' });
    setBusy(false);
    if (!r.ok) { setErreur((await r.json().catch(() => ({}))).error ?? t('erreurs.impossible')); return; }
    router.refresh();
  }

  if (!ouvert) {
    return (
      <button type="button" className="suppr-btn" aria-label={t('soiree.supprimerAria', { date })} onClick={() => setOuvert(true)}>
        {t('soiree.supprimer')}
      </button>
    );
  }
  return (
    <div className="confirm-suppr" role="group" aria-label={t('soiree.supprimerTitre')}>
      <b>{t('soiree.supprimerTitre')}</b>
      <ul>
        <li>{joueurs.length > 0 ? t('soiree.supprimerJoueurs', { qui: frJoin(joueurs, lang) }) : t('soiree.supprimerSeul')}</li>
        {invites.length > 0 && <li>{t('soiree.supprimerInvites', { qui: frJoin(invites, lang) })}</li>}
        <li>{t('soiree.supprimerJeux', { n: nbJeux })}</li>
      </ul>
      {erreur && <p className="error" role="alert">{erreur}</p>}
      <div className="lien-actions">
        <button type="button" className="btn-ghost" onClick={() => setOuvert(false)}>{t('soiree.garder')}</button>
        <button type="button" className="btn-danger" disabled={busy} onClick={supprimer}>{t('soiree.supprimerConfirmer')}</button>
      </div>
    </div>
  );
}
