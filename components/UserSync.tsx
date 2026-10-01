'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Sync live de l'étagère : ajout à une partie, jeu posé ou retiré par un autre
// joueur → la page se rafraîchit toute seule, y compris l'écran « nouvelle
// partie » d'un joueur qu'on vient d'ajouter. Composant invisible, rendu par
// la page /etagere dans tous ses états.
// Lecture du flux /api/me/events en fetch (et non EventSource) : certains
// navigateurs ne livrent les messages SSE qu'à la fermeture du flux — le
// lecteur fetch, lui, reçoit les octets au fil de l'eau partout.
// body[data-sync="on"] signale la connexion établie (les tests l'attendent
// avant de provoquer un événement : jamais perdu, jamais de délai arbitraire).
export default function UserSync() {
  const router = useRouter();
  useEffect(() => {
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let relance: ReturnType<typeof setTimeout> | null = null;
    let vivant = true;

    const ecoute = async () => {
      try {
        const res = await fetch('/api/me/events', { signal: ctrl.signal, cache: 'no-store' });
        if (!res.body) throw new Error('pas de flux');
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        document.body.dataset.sync = 'on';
        router.refresh(); // (re)connexion : rattrape tout ce qui a changé pendant la coupure
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const texte = decoder.decode(value);
          if (texte.includes('event: change') || texte.includes(': battement')) {
            // change = un joueur a bougé qqch ; battement = 30 s : l'app qui
            // dormait (téléphone en veille) rattrape son retard au réveil.
            if (timer) continue; // regroupe les rafales d'événements
            if (texte.includes(': battement') && document.visibilityState !== 'visible') continue;
            timer = setTimeout(() => { timer = null; router.refresh(); }, 250);
          }
        }
      } catch {
        /* abort ou coupure : on relance */
      }
      if (vivant && !ctrl.signal.aborted) {
        relance = setTimeout(ecoute, 1000); // reconnexion automatique
      }
    };
    ecoute();

    return () => {
      vivant = false;
      ctrl.abort();
      if (timer) clearTimeout(timer);
      if (relance) clearTimeout(relance);
      delete document.body.dataset.sync;
    };
  }, [router]);
  return null;
}
