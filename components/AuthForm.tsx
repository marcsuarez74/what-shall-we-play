'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PinInput from './PinInput';
import { ALLOWED_STICKERS } from '@/lib/stickers';

export default function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const [pseudo, setPseudo] = useState('');
  const [code, setCode] = useState('');
  const [sticker, setSticker] = useState('🎲');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    const res = await fetch(`/api/auth/${mode}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mode === 'register' ? { pseudo, code, sticker } : { pseudo, code }),
    });
    setBusy(false);
    if (!res.ok) { setError((await res.json()).error); return; }
    router.push('/etagere'); router.refresh();
  }

  return (
    <form onSubmit={submit} className="auth-form">
      <h1>{mode === 'login' ? 'Bonsoir !' : 'Créer un compte'}</h1>
      <label>Pseudo
        <input value={pseudo} onChange={(e) => setPseudo(e.target.value)} autoComplete="username" required />
      </label>
      <span className="pin-label">Code secret — 4 chiffres</span>
      <PinInput label="Code secret" value={code} onChange={setCode}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
      {mode === 'register' && (
        <>
          <span className="pin-label">Choisis ton avatar — modifiable au profil</span>
          <div className="sticker-grid" role="group" aria-label="Choisis ton avatar">
            {ALLOWED_STICKERS.map((s) => (
              <button type="button" key={s} className={s === sticker ? 'on' : ''}
                      aria-pressed={s === sticker} aria-label={`Avatar ${s}`}
                      onClick={() => setSticker(s)}>{s}</button>
            ))}
          </div>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <button disabled={busy || code.length !== 4}>{mode === 'login' ? 'Entrer' : 'Créer mon compte'}</button>
      <a href={mode === 'login' ? '/register' : '/login'}>
        {mode === 'login' ? 'Pas de compte ? Le créer' : 'Déjà un compte ? Entrer'}
      </a>
    </form>
  );
}
