'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/etagere', icon: '♟', label: 'Étagère' },
  { href: '/library', icon: '📚', label: 'Bibliothèque' },
  { href: '/games/add', icon: '➕', label: 'Ajouter' },
  { href: '/nights', icon: '🎲', label: 'Soirées' },
];

// La roue et les écrans de connexion restent hors navigation (moment plein écran / pas de session).
const HIDDEN = ['/login', '/register', '/tirage'];

export default function TabBar() {
  const path = usePathname();
  if (path === '/' || HIDDEN.includes(path)) return null;
  return (
    <nav className="tabbar" aria-label="Navigation principale">
      {TABS.map((t) => {
        const active = path === t.href;
        return (
          <Link key={t.href} href={t.href} className={active ? 'on' : ''}
                aria-current={active ? 'page' : undefined}>
            <span className="ico" aria-hidden>{t.icon}</span>{t.label}
          </Link>
        );
      })}
    </nav>
  );
}
