import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getSessionUser } from '@/lib/session';
import BugReportClient from '@/components/BugReportClient';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLang(), 'bugs.metaTitre') };
}

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return (
    <main className="page bugs-page">
      <BugReportClient pseudo={user.pseudo} />
    </main>
  );
}
