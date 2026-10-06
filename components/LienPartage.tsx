'use client';
import { useState } from 'react';
import { shareMessage } from '@/lib/announce';
import { useI18n } from './LanguageProvider';

// v4.8.0 — un lien à partager (lien d'ami, lien de cercle) : URL lisible, Copier, WhatsApp.
export default function LienPartage({ titre, aide, lien, message }: { titre: string; aide?: string; lien: string; message: string }) {
  const { t } = useI18n();
  const [copie, setCopie] = useState(false);
  async function copier() {
    try { await navigator.clipboard.writeText(lien); setCopie(true); setTimeout(() => setCopie(false), 2000); }
    catch { window.prompt(titre, lien); } // presse-papiers refusé : copie manuelle
  }
  return (
    <div className="lien-card">
      <p className="sous-label">{titre}</p>
      <p className="lien-url">{lien}</p>
      {aide && <p className="hint">{aide}</p>}
      <div className="lien-actions">
        <button type="button" className="btn-copper" onClick={copier}>{copie ? t('amis.copie') : t('amis.copier')}</button>
        <button type="button" className="btn-ghost" onClick={() => shareMessage(message)}>{t('amis.whatsapp')}</button>
      </div>
    </div>
  );
}
