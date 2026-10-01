'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import pkg from '../package.json';
import { avatarSrc } from '@/lib/formats';
import type { UserLite } from '@/lib/types';

// Pastille utilisateur partagée : en haut à droite de chaque page (maquette v2.1.0).
// La roue et les écrans de connexion restent plein écran, sans menu.
export default function UserMenu({ me }: { me: UserLite }) {
  const router = useRouter();
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function closeMenu(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) ref.current.open = false;
    }
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, []);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  const initial = (me.pseudo ?? '?')[0].toUpperCase();
  const myAvatar = avatarSrc(me);

  return (
    <details className="user-chip" ref={ref}>
      <summary aria-label="Menu utilisateur">
        {myAvatar ? <img className="chip-avatar" src={myAvatar} alt="" /> : <span aria-hidden="true">{me.sticker ?? '🎲'}</span>}
        {' '}{initial} ▾
      </summary>
      <div className="user-menu">
        <a href="/profil">Mon profil</a>
        <button type="button" onClick={logout}>Se déconnecter</button>
        <span className="user-version">v{pkg.version}</span>
      </div>
    </details>
  );
}
