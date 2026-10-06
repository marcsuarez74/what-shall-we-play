import { redirect } from 'next/navigation';
import { getSessionUser, getSessionInvite } from '@/lib/session';

export default async function Home() {
  if (await getSessionInvite()) redirect('/invite'); // v4.7.0 : l'invité n'a que sa soirée
  redirect((await getSessionUser()) ? '/etagere' : '/login');
}
