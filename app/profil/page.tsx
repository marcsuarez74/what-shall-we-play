import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { getProfileStats } from '@/lib/users';
import ProfileClient from '@/components/ProfileClient';

export const metadata = { title: 'Mon profil — What Shall We Play?' };

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return (
    <main className="page profile-page">
      <ProfileClient
        me={{ pseudo: user.pseudo, sticker: user.sticker ?? null, avatar_path: user.avatar_path ?? null }}
        stats={getProfileStats(user.id)}
      />
    </main>
  );
}
