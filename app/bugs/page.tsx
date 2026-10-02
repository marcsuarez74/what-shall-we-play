import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import BugReportClient from '@/components/BugReportClient';

export const metadata = { title: 'Rapporter un bug — What Shall We Play?' };

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return (
    <main className="page bugs-page">
      <BugReportClient pseudo={user.pseudo} />
    </main>
  );
}
