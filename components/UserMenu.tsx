'use client';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import pkg from '../package.json';
import { avatarSrc } from '@/lib/formats';
import type { UserLite } from '@/lib/types';
import { useI18n } from './LanguageProvider';
import LanguageSwitch from './LanguageSwitch';

// Pastille utilisateur partagée : en haut à droite de chaque page (maquette v2.1.0).
// La roue et les écrans de connexion restent plein écran, sans menu.
export default function UserMenu({ me }: { me: UserLite }) {
  const router = useRouter();
  const pathname = usePathname();
  const { lang, t } = useI18n();
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function closeMenu(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) ref.current.open = false;
    }
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, []);

  async function logout() {
    // Purge explicite du jeton d'appareil : sans lui, la restauration
    // silencieuse remettrait la connexion en place au prochain démarrage.
    const dt = localStorage.getItem('wsp_device_token');
    await fetch('/api/auth/logout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_token: dt }),
    });
    localStorage.removeItem('wsp_device_token');
    // Pas de router.refresh() ici : appelé pendant la navigation qu'il lance,
    // il re-rend l'ancienne route (la course push/refresh laissait la soirée
    // affichée en CI) ; /login se rend fraîche de toute façon.
    router.push('/login');
  }

  const initial = (me.pseudo ?? '?')[0].toUpperCase();
  const myAvatar = avatarSrc(me);

  return (
    <details className="user-chip" ref={ref}>
      <summary aria-label={t('menu.utilisateur')}>
        {myAvatar ? <img className="chip-avatar" src={myAvatar} alt="" /> : <span aria-hidden="true">{me.sticker ?? '🎲'}</span>}
        {' '}{initial} ▾
      </summary>
      <div className="user-menu">
        <Link href="/profil">{t('menu.profil')}</Link>
        <button type="button" onClick={logout}>{t('menu.deconnexion')}</button>
        <Link href="/faq">{t('menu.faq')}</Link>
        <Link href={{ pathname: '/bugs', query: { depuis: pathname } }}>{t('menu.bug')}</Link>
        <LanguageSwitch lang={lang} />
        <span className="user-version">v{pkg.version}</span>
      </div>
    </details>
  );
}
