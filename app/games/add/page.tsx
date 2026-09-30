import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import AddGameForm from '@/components/AddGameForm';
export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return <main className="page"><AddGameForm /></main>;
}
