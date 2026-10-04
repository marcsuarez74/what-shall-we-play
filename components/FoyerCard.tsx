'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { avatarSrc } from '@/lib/formats';
import type { Game } from '@/lib/types';
import DedupeFlow from './DedupeFlow';
import { useI18n } from './LanguageProvider';

export type FoyerData = {
  id: number; name: string; invite_code: string; created_by: number;
  members: { id: number; pseudo: string; sticker: string | null; avatar_path: string | null; role: 'créateur' | 'membre' }[];
};
type GP = Game & { picks?: number };

// Carte « Foyer » du profil : sans foyer, proposer créer / rejoindre (code dicté) ;
// en foyer, montrer la collection partagée (nom, membres, code) et permettre d'en sortir.
// Quitter/dissoudre suivent l'idiome de l'app : double-tap de confirmation.
export default function FoyerCard({ foyer, meId }: { foyer: FoyerData | null; meId: number }) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [code, setCode] = useState('');
  const [dupes, setDupes] = useState<{ a: GP; b: GP }[] | null>(null);
  const [foyerName, setFoyerName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const [armed, setArmed] = useState<'leave' | 'dissolve' | null>(null);
  const [armedKick, setArmedKick] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  async function create() {
    setBusy(true); setError(null);
    const res = await fetch('/api/foyers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    setBusy(false);
    if (!res.ok) { setError((await res.json()).error); return; }
    router.refresh();
  }

  async function join() {
    setBusy(true); setError(null);
    const res = await fetch('/api/foyers/join', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setError(data.error); return; }
    if (data.dupes?.length) { setFoyerName(data.name); setDupes(data.dupes); }
    else { setJoinOpen(false); router.refresh(); }
  }

  async function saveRename() {
    setBusy(true); setError(null);
    const res = await fetch('/api/foyers', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    setBusy(false);
    if (!res.ok) { setError((await res.json()).error); return; }
    setRenaming(false);
    router.refresh();
  }

  async function act(kind: 'leave' | 'dissolve') {
    if (armed !== kind) {
      setArmed(kind);
      setTimeout(() => setArmed((a) => (a === kind ? null : a)), 4000);
      return;
    }
    setArmed(null); setBusy(true);
    await fetch(kind === 'leave' ? '/api/foyers/leave' : '/api/foyers', { method: kind === 'leave' ? 'POST' : 'DELETE' });
    setBusy(false);
    router.refresh();
  }

  // Retirer un membre (créateur) : même idiome double-tap ; ses ajouts le suivent.
  async function kick(userId: number) {
    if (armedKick !== userId) {
      setArmedKick(userId);
      setTimeout(() => setArmedKick((a) => (a === userId ? null : a)), 4000);
      return;
    }
    setArmedKick(null); setBusy(true); setError(null);
    const res = await fetch('/api/foyers/members', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }),
    });
    setBusy(false);
    if (!res.ok) { setError((await res.json()).error); return; }
    router.refresh();
  }

  function copyCode() {
    navigator.clipboard?.writeText(foyer?.invite_code ?? '').then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => { /* presse-papier indisponible : le code reste visible, dictable */ },
    );
  }

  if (!foyer) {
    return (
      <div className="foyer-card solo">
        <div className="foyer-head"><span className="foyer-ico" aria-hidden>🏠</span><span className="foyer-name small">{t('foyer.biblioPerso')}</span></div>
        <div className="foyer-empty">
          <p>{t('foyer.videAvant')}<b>{t('foyer.mot')}</b>{t('foyer.videApres')}</p>
          <button type="button" className="btn-copper foyer-btn" disabled={busy} onClick={create}>{t('foyer.creer')}</button>
          {!joinOpen ? (
            <button type="button" className="btn-ghost" onClick={() => { setJoinOpen(true); setError(null); }}>{t('foyer.rejoindreCode')}</button>
          ) : (
            <div className="join-form">
              <input className="code-input" aria-label={t('foyer.codeAria')} placeholder={t('foyer.codePh')}
                     maxLength={6} autoComplete="off" value={code}
                     onChange={(e) => setCode(e.target.value.toUpperCase())} />
              <button type="button" className="btn-copper foyer-btn" disabled={busy || code.trim().length !== 6} onClick={join}>{t('foyer.rejoindre')}</button>
            </div>
          )}
          {error && <p className="error" role="alert">{error}</p>}
        </div>
        {dupes && <DedupeFlow pairs={dupes} foyerName={foyerName}
                              onDone={() => { setDupes(null); setJoinOpen(false); router.refresh(); }} />}
      </div>
    );
  }

  const isCreator = foyer.created_by === meId;

  return (
    <div className="foyer-card">
      <div className="foyer-head">
        <span className="foyer-ico" aria-hidden>🏠</span>
        {renaming ? (
          <span className="rename-row">
            <input className="rename-input" aria-label={t('foyer.nomAria')} value={name} maxLength={60}
                   onChange={(e) => setName(e.target.value)} />
            <button type="button" className="link-btn" aria-label={t('foyer.enregistrerNomAria')} disabled={busy || !name.trim()} onClick={saveRename}>✓</button>
            <button type="button" className="link-btn" aria-label={t('soiree.annuler')} onClick={() => setRenaming(false)}>✕</button>
          </span>
        ) : (
          <span className="foyer-name">{foyer.name}
            <button type="button" className="pen" aria-label={t('foyer.renommerAria')} onClick={() => { setName(foyer.name); setRenaming(true); }}>✏️</button>
          </span>
        )}
      </div>
      <p className="foyer-sub">{t('foyer.sub')}</p>
      <div className="members">
        {foyer.members.map((m) => (
          <div key={m.id} className="member">
            {avatarSrc(m)
              ? <img className="st" src={avatarSrc(m) as string} alt="" />
              : <span className="st" aria-hidden>{m.sticker ?? '🎲'}</span>}
            <b>{m.pseudo}</b>
            <span className="role">{t(m.role === 'créateur' ? 'foyer.roleCreateur' : 'foyer.roleMembre')}</span>
            {isCreator && m.id !== meId && (
              <button type="button" className={`kick ${armedKick === m.id ? 'armed' : ''}`}
                      aria-label={armedKick === m.id ? t('foyer.kickSurAria', { p: m.pseudo }) : t('foyer.kickAria', { p: m.pseudo })}
                      disabled={busy} onClick={() => kick(m.id)}>
                {armedKick === m.id ? t('foyer.kickSur') : '✕'}
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="code-zone">
        <span className="code">{foyer.invite_code}</span>
        <button type="button" onClick={copyCode}>{copied ? t('foyer.copie') : t('foyer.copier')}</button>
      </div>
      <p className="foyer-hint">{t('foyer.inviteHint')}</p>
      <button type="button" className={`btn-ghost danger ${armed === 'leave' ? 'armed' : ''}`} disabled={busy}
              onClick={() => act('leave')}>
        {armed === 'leave' ? t('foyer.quitterSur') : t('foyer.quitter')}
      </button>
      {isCreator && (
        <button type="button" className={`btn-ghost danger ${armed === 'dissolve' ? 'armed' : ''}`} disabled={busy}
                onClick={() => act('dissolve')}>
          {armed === 'dissolve' ? t('foyer.dissoudreSur') : t('foyer.dissoudre')}
        </button>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
