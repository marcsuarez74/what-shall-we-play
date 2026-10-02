import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { getNight } from '@/lib/nights';

// ⚠️ PLACEHOLDER Task 7 — remplacé ENTIÈREMENT par Task 8 (détail de soirée
// avec podium .pod1/.pod23). Il existe pour donner une destination réelle à la
// redirection du carnet des scores (`router.push('/nights/[id]')`).
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const night = getNight(Number((await params).id));
  if (!night) redirect('/nights');
  return (
    <main className="page fin-page">
      <header className="fin-hero">
        <span className="fin-check" aria-hidden="true">✓</span>
        <h1>Partie terminée ✓</h1>
        <span className="badge-etat b-term"><span className="pt" />Terminée</span>
      </header>
      <p className="empty">Le récapitulatif de la soirée arrive avec le détail de soirée.</p>
    </main>
  );
}
