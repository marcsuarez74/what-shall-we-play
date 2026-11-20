import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import ImportCsvClient from '@/components/ImportCsvClient';

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return <main className="page"><ImportCsvClient me={user} /></main>;
}
