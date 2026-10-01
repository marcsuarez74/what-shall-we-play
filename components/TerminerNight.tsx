'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// « Terminer la soirée » : premier tap arme la confirmation (4 s), le second termine.
// Terminer envoie la soirée à l'historique sans rien supprimer.
export default function TerminerNight({ nightId }: { nightId: number }) {
  const router = useRouter();
  const [sure, setSure] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

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
      {sure ? 'Sûr ? Terminer' : 'Terminer la soirée'}
    </button>
  );
}
