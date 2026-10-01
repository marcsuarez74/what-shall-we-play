'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Sync live de l'étagère (SSE par utilisateur) : ajout à une partie, jeu posé ou
// retiré par un autre joueur → la page se rafraîchit toute seule, y compris
// l'écran « nouvelle partie » d'un joueur qu'on vient d'ajouter. Composant
// invisible, rendu par la page /etagere dans tous ses états.
// body[data-sync="on"] signale la connexion établie (les tests l'attendent
// avant de provoquer un événement : jamais perdu, jamais de délai arbitraire).
export default function UserSync() {
  const router = useRouter();
  useEffect(() => {
    const es = new EventSource('/api/me/events');
    let timer: ReturnType<typeof setTimeout> | null = null;
    es.onopen = () => { document.body.dataset.sync = 'on'; };
    es.addEventListener('change', () => {
      if (timer) return; // regroupe les rafales d'événements
      timer = setTimeout(() => { timer = null; router.refresh(); }, 250);
    });
    return () => { es.close(); if (timer) clearTimeout(timer); };
  }, [router]);
  return null;
}
