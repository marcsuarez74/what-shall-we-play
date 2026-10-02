'use client';
import { buildPodiumMessage, shareMessage } from '@/lib/announce';

// « 💬 Partager les résultats » : compose le message de podium (buildPodiumMessage)
// puis partage natif sinon wa.me — le pattern d'annonce existant (TirageClient).
// Sans scores (classement vide), le bouton n'existe pas.
export default function PartagerResultats({ titre, classement }: { titre: string; classement: { pseudo: string; score: number; rank: number }[] }) {
  if (classement.length === 0) return null;
  return (
    <button type="button" className="btn-ghost partager-btn"
            onClick={() => shareMessage(buildPodiumMessage({ title: titre, classement }))}>
      💬 Partager les résultats
    </button>
  );
}
