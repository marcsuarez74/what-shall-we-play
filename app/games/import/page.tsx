import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import ImportBggClient from '@/components/ImportBggClient';

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return <main className="page"><ImportBggClient me={user} /></main>;
}
