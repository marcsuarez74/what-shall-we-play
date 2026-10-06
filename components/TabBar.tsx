'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { CléDict } from '@/lib/i18n';
import { useI18n } from './LanguageProvider';

const TABS: { href: string; icon: string; label: CléDict }[] = [
  { href: '/etagere', icon: '🗄️', label: 'tabbar.etagere' },
  { href: '/library', icon: '📚', label: 'tabbar.ludotheque' },
  { href: '/games/add', icon: '➕', label: 'tabbar.ajouter' },
  { href: '/nights', icon: '🎲', label: 'tabbar.parties' },
];

// La roue, les écrans de connexion et la jointure invité restent hors navigation
// (moment plein écran / pas de session).
const HIDDEN = ['/login', '/register', '/tirage'];
export default function TabBar() {
  const path = usePathname();
  const { t } = useI18n();
  // v4.7.0 : /invite (la soirée de l'invité) n'a pas d'onglets — il n'a accès à rien d'autre.
  if (path === '/' || HIDDEN.includes(path) || path === '/invite' || path.endsWith('/rejoindre') || path.endsWith('/scores')) return null;
  return (
    <nav className="tabbar" aria-label={t('tabbar.navigation')}>
      {TABS.map((tab) => {
        const active = path === tab.href;
        return (
          <Link key={tab.href} href={tab.href} className={active ? 'on' : ''}
                aria-current={active ? 'page' : undefined}>
            <span className="ico" aria-hidden>{tab.icon}</span>{t(tab.label)}
          </Link>
        );
      })}
    </nav>
  );
}
