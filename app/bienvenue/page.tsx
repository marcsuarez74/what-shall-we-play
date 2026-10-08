import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import OnboardingGames from '@/components/OnboardingGames';

// Étape 2 de l'inscription (v4.18.0) : ajouter ses jeux. ?next= (chemin interne
// seulement) : retour au lien d'invitation une fois l'étape terminée ou passée.
export default async function BienvenuePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const { next } = await searchParams;
  const suite = typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : undefined;
  return (
    <main className="page onb-page">
      <OnboardingGames pseudo={user.pseudo} next={suite} />
    </main>
  );
}
