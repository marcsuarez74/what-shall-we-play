'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from './LanguageProvider';

// v4.8.0 — ajouter un ami par pseudo : une demande (ou l'amitié directe s'il m'avait déjà demandé).
export default function AjoutAmi() {
  const { t } = useI18n();
  const router = useRouter();
  const [pseudo, setPseudo] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texte: string } | null>(null);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    const p = pseudo.trim();
    if (!p) return;
    setBusy(true); setMsg(null);
    const r = await fetch('/api/amis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pseudo: p }) });
    const data = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, texte: data.error ?? t('erreurs.impossible') }); return; }
    setMsg({ ok: true, texte: data.etat === 'ami' ? t('amis.devenusAmis', { p }) : t('amis.demandeOk', { p }) });
    setPseudo('');
    router.refresh();
  }

  return (
    <form className="ajout-ami" onSubmit={envoyer}>
      <label htmlFor="ajout-ami-pseudo" className="sous-label">{t('amis.ajouterPseudo')}</label>
      <div className="ajout-ami-row">
        <input id="ajout-ami-pseudo" type="text" value={pseudo} maxLength={20} autoComplete="off" autoCapitalize="none"
               placeholder={t('amis.pseudo')} onChange={(e) => setPseudo(e.target.value)} />
        <button className="btn-copper" disabled={busy || !pseudo.trim()}>{t('amis.envoyer')}</button>
      </div>
      {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.texte}</p>}
    </form>
  );
}
