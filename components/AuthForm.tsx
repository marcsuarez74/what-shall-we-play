'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PinInput from './PinInput';
import LanguageSwitch from './LanguageSwitch';
import { useI18n } from './LanguageProvider';
import { ALLOWED_STICKERS } from '@/lib/stickers';

// Jeton d'appareil « Se souvenir de moi » (v4.5.0) : gardé en localStorage pour
// restaurer la session quand la PWA perd son cookie (constaté sur Android).
const DEVICE_KEY = 'wsp_device_token';

export default function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const { lang, t } = useI18n();
  const [pseudo, setPseudo] = useState('');
  const [code, setCode] = useState('');
  const [sticker, setSticker] = useState('🎲');
  const [seSouvenir, setSeSouvenir] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Restauration silencieuse au démarrage : le cookie a disparu (PWA tuée) mais
  // le jeton d'appareil est là → session rétablie sans saisie. Jeton à usage
  // unique : le serveur en rend un neuf qu'on re-range.
  useEffect(() => {
    if (mode !== 'login') return;
    const dt = localStorage.getItem(DEVICE_KEY);
    if (!dt) return;
    fetch('/api/auth/restore', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: dt }),
    })
      .then(async (r) => {
        if (!r.ok) { localStorage.removeItem(DEVICE_KEY); return; }
        const data = await r.json();
        localStorage.setItem(DEVICE_KEY, data.device_token);
        router.push('/etagere'); // push suffit (Next 15) — cf. UserMenu.logout
      })
      .catch(() => {}); // hors ligne : la page de login reste affichée
  }, [mode, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    const body = mode === 'register'
      ? { pseudo: pseudo.trim(), code, sticker }
      : { pseudo: pseudo.trim(), code, remember: seSouvenir };
    const res = await fetch(`/api/auth/${mode}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) { setError((await res.json()).error); return; }
    const data = await res.json().catch(() => ({})) as { device_token?: string };
    if (data.device_token) localStorage.setItem(DEVICE_KEY, data.device_token);
    router.push('/etagere'); router.refresh();
  }

  return (
    <form onSubmit={submit} className="auth-form">
      <h1>{t(mode === 'login' ? 'auth.titreLogin' : 'auth.titreRegister')}</h1>
      <label>{t('auth.pseudo')}
        <input value={pseudo} onChange={(e) => setPseudo(e.target.value)} autoComplete="username" required />
      </label>
      <span className="pin-label">{t('auth.codeSecret')}</span>
      <PinInput label={t('auth.codeSecretLabel')} value={code} onChange={setCode}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
      {mode === 'login' && (
        <label className="remember">
          <input type="checkbox" checked={seSouvenir} onChange={(e) => setSeSouvenir(e.target.checked)} />
          {t('auth.seSouvenir')}
        </label>
      )}
      {mode === 'register' && (
        <>
          <span className="pin-label">{t('auth.avatarChoix')}</span>
          <div className="sticker-grid" role="group" aria-label={t('auth.avatarGroupe')}>
            {ALLOWED_STICKERS.map((s) => (
              <button type="button" key={s} className={s === sticker ? 'on' : ''}
                      aria-pressed={s === sticker} aria-label={t('auth.avatarUn', { s })}
                      onClick={() => setSticker(s)}>{s}</button>
            ))}
          </div>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <button disabled={busy || code.length !== 4}>{t(mode === 'login' ? 'auth.entrer' : 'auth.creer')}</button>
      <a href="/faq">{t('auth.faq')}</a>
      <a href={mode === 'login' ? '/register' : '/login'}>
        {t(mode === 'login' ? 'auth.lienLogin' : 'auth.lienRegister')}
      </a>
      <LanguageSwitch lang={lang} />
      {mode === 'login' && (
        <img className="auth-bgg" src="/logos/powered-by-bgg.svg" alt="Powered by BoardGameGeek" />
      )}
    </form>
  );
}
