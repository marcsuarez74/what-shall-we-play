'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from './LanguageProvider';

// v4.8.0 — un bouton qui appelle l'API puis rafraîchit la page (ou y navigue).
// confirmer : premier clic arme (« Sûr ? »), le second agit — suppressions explicites.
export default function BoutonAction({ url, method = 'POST', body, label, className = 'btn-ghost', ariaLabel, confirmer, pressed, aller }: {
  url: string; method?: 'POST' | 'PATCH' | 'DELETE'; body?: unknown; label: string; className?: string;
  ariaLabel?: string; confirmer?: string; pressed?: boolean; aller?: string;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [arme, setArme] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function agir() {
    if (confirmer && !arme) { setArme(true); return; }
    setBusy(true); setErreur(null);
    const r = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    setBusy(false); setArme(false);
    if (!r.ok) { setErreur((await r.json().catch(() => ({}))).error ?? t('erreurs.impossible')); return; }
    if (aller) router.push(aller); else router.refresh();
  }

  return (
    <>
      <button type="button" className={`${className}${arme ? ' armed' : ''}`} disabled={busy} onClick={agir}
              aria-label={arme ? undefined : ariaLabel} aria-pressed={pressed}
              onBlur={() => setArme(false)}>
        {arme ? confirmer : label}
      </button>
      {erreur && <span className="error" role="alert">{erreur}</span>}
    </>
  );
}
