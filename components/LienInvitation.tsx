'use client';
import { useState } from 'react';
import { useI18n } from './LanguageProvider';
import InviteButton from './InviteButton';

// v4.7.0 — le lien d'invitation d'une partie, côté créateur : l'URL lisible,
// « Copier le lien » et le partage (message composé + lien, cf. InviteButton).
export default function LienInvitation({ lien, partage }: {
  lien: string;
  partage: { dateLong: string; time: string | null; pseudos: string[]; titre?: string | null };
}) {
  const { t } = useI18n();
  const [copie, setCopie] = useState(false);
  async function copier() {
    try { await navigator.clipboard.writeText(lien); setCopie(true); setTimeout(() => setCopie(false), 2000); }
    catch { window.prompt(t('soiree.lienTitre'), lien); } // presse-papiers refusé : copie manuelle
  }
  return (
    <div className="lien-card">
      <p className="sous-label">{t('soiree.lienTitre')}</p>
      <p className="lien-url">{lien}</p>
      <div className="lien-actions">
        <button type="button" className="btn-copper" onClick={copier}>{copie ? t('soiree.lienCopie') : t('soiree.lienCopier')}</button>
        <InviteButton {...partage} lien={lien} />
      </div>
    </div>
  );
}
