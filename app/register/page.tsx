import AuthForm from '@/components/AuthForm';

// ?next= (chemin interne seulement) : retour au lien d'ami ou de cercle reçu (v4.8.0).
export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const suite = typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : undefined;
  return (
    <main className="auth-page">
      <AuthForm mode="register" next={suite} />
    </main>
  );
}
