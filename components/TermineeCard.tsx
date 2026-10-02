import Link from 'next/link';

// v3.3 — la soirée du jour est terminée : l'étagère repart vide, les scores
// vivent dans l'onglet Parties. (Le serveur ne passe que ce qui existe.)
export default function TermineeCard({ nightId, gameTitle }: { nightId: number; gameTitle: string | null }) {
  return (
    <section className="night-card terminee" aria-label="Soirée terminée">
      <div className="night-card-head">
        <span className="night-label">SOIRÉE DU JOUR</span>
        <span className="badge-etat b-term"><span className="pt" />Terminée</span>
      </div>
      <div className="bandeau g">
        <span className="b-cov">📦</span>
        <div><b>{gameTitle ?? 'Partie terminée'}</b><span>Scores enregistrés — retrouvez la soirée dans l&apos;onglet Parties.</span></div>
      </div>
      <Link className="btn-copper vert" href={`/nights/${nightId}`}>Voir les scores dans Parties →</Link>
    </section>
  );
}
