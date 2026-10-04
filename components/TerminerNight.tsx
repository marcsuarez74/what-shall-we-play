'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from './LanguageProvider';

// « Terminer la partie » : premier tap arme la confirmation (4 s), le second termine.
// Terminer envoie la partie à l'historique sans rien supprimer.
// Quand la partie est en jeu, le créateur passe par le carnet des scores —
// le double-appui ne sert plus qu'à l'abandon d'une partie en préparation.
export default function TerminerNight({ nightId, status }: { nightId: number; status: 'creation' | 'en_jeu' | 'termine' }) {
  const router = useRouter();
  const { t } = useI18n();
  const [sure, setSure] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (status === 'en_jeu') {
    return <a className="btn-ghost end-btn" href={`/nights/${nightId}/scores`}>{t('etagere.finPartie')}</a>;
  }

  async function end() {
    if (!sure) {
      setSure(true);
      timer.current = setTimeout(() => setSure(false), 4000); // désarmé si on ne confirme pas
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    await fetch(`/api/nights/${nightId}/end`, { method: 'POST' });
    router.refresh();
  }

  return (
    <button type="button" className={`btn-ghost end-btn ${sure ? 'armed' : ''}`} onClick={end}>
      {sure ? t('soiree.surTerminer') : t('soiree.terminerPartie')}
    </button>
  );
}
