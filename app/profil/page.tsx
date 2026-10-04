import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getSessionUser } from '@/lib/session';
import { getProfileStats, getMyParties } from '@/lib/users';
import { verdictPersoStats } from '@/lib/verdicts';
import { getNightScores } from '@/lib/nights';
import { rankScores, medaille } from '@/lib/ranks';
import { getFoyerForUser } from '@/lib/foyers';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import ProfileClient from '@/components/ProfileClient';

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLang(), 'profil.metaTitre') };
}

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  // « Mes parties » : la médaille se calcule CÔTÉ SERVEUR (rankScores sur les
  // scores de chaque soirée, ≤ 6 requêtes) — le client reçoit un simple string.
  const parties = getMyParties(user.id).map((p) => {
    const moi = rankScores(getNightScores(p.id)).find((r) => r.user_id === user.id);
    return { ...p, med: moi ? medaille(moi.rank) : '' };
  });
  return (
    <main className="page profile-page">
      <ProfileClient
        me={{ id: user.id, pseudo: user.pseudo, sticker: user.sticker ?? null, avatar_path: user.avatar_path ?? null }}
        stats={getProfileStats(user.id)}
        verdictStats={verdictPersoStats(user.id)}
        foyer={getFoyerForUser(user.id)}
        parties={parties}
      />
    </main>
  );
}
