import { redirect } from 'next/navigation';
import AuthForm from '@/components/AuthForm';
import { getSessionInvite } from '@/lib/session';

// v4.7.0 : un invité n'a pas de connexion — toute page refusée le renvoie à sa soirée.
// ?next= (chemin interne seulement) : « Me connecter et rejoindre » depuis un lien d'invitation.
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSessionInvite()) redirect('/invite');
  const { next } = await searchParams;
  const suite = typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : undefined;
  return (
    <main className="auth-page">
      <AuthForm mode="login" next={suite} />
    </main>
  );
}
