'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Lang } from '@/lib/i18n';

// Sélecteur FR/EN : POST /api/lang pose le cookie (+ users.lang si session) puis
// router.refresh() relit le layout. Libellés FR/EN et endonymes « Français » /
// « English » : identiques dans les deux langues, rien à traduire.
export default function LanguageSwitch({ lang }: { lang: Lang }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function choisir(cible: Lang) {
    if (cible === lang || busy) return;
    setBusy(true);
    await fetch('/api/lang', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang: cible }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="lang-switch">
      <button type="button" aria-label="Français" aria-pressed={lang === 'fr'} disabled={busy}
              onClick={() => choisir('fr')}>FR</button>
      <button type="button" aria-label="English" aria-pressed={lang === 'en'} disabled={busy}
              onClick={() => choisir('en')}>EN</button>
    </div>
  );
}
