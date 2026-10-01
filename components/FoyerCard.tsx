'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { avatarSrc } from '@/lib/formats';
import type { Game } from '@/lib/types';
import DedupeFlow from './DedupeFlow';

export type FoyerData = {
  id: number; name: string; invite_code: string; created_by: number;
  members: { id: number; pseudo: string; sticker: string | null; avatar_path: string | null; role: 'créateur' | 'membre' }[];
};
type GP = Game & { picks?: number };

// Carte « Foyer » du profil : sans foyer, proposer créer / rejoindre (code dicté) ;
// en foyer, montrer la collection partagée (nom, membres, code) et permettre d'en sortir.
// Quitter/dissoudre suivent l'idiome de l'app : double-tap de confirmation.
export default function FoyerCard({ foyer, meId }: { foyer: FoyerData | null; meId: number }) {
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
        <div className="foyer-head"><span className="foyer-ico" aria-hidden>🏠</span><span className="foyer-name small">Bibliothèque personnelle</span></div>
        <div className="foyer-empty">
          <p>Vous jouez avec votre propre bibliothèque. En couple ou en colocation ? Créez un <b>foyer</b> pour partager une seule collection, tenue à plusieurs.</p>
          <button type="button" className="btn-copper foyer-btn" disabled={busy} onClick={create}>Créer un foyer</button>
          {!joinOpen ? (
            <button type="button" className="btn-ghost" onClick={() => { setJoinOpen(true); setError(null); }}>Rejoindre avec un code</button>
          ) : (
            <div className="join-form">
              <input className="code-input" aria-label="Code du foyer" placeholder="Code à 6 caractères"
                     maxLength={6} autoComplete="off" value={code}
                     onChange={(e) => setCode(e.target.value.toUpperCase())} />
              <button type="button" className="btn-copper foyer-btn" disabled={busy || code.trim().length !== 6} onClick={join}>Rejoindre</button>
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
            <input className="rename-input" aria-label="Nom du foyer" value={name} maxLength={60}
                   onChange={(e) => setName(e.target.value)} />
            <button type="button" className="link-btn" aria-label="Enregistrer le nom" disabled={busy || !name.trim()} onClick={saveRename}>✓</button>
            <button type="button" className="link-btn" aria-label="Annuler" onClick={() => setRenaming(false)}>✕</button>
          </span>
        ) : (
          <span className="foyer-name">{foyer.name}
            <button type="button" className="pen" aria-label="Renommer le foyer" onClick={() => { setName(foyer.name); setRenaming(true); }}>✏️</button>
          </span>
        )}
      </div>
      <p className="foyer-sub">Une collection commune — chacun ajoute, modifie, écarte.</p>
      <div className="members">
        {foyer.members.map((m) => (
          <div key={m.id} className="member">
            {avatarSrc(m)
              ? <img className="st" src={avatarSrc(m) as string} alt="" />
              : <span className="st" aria-hidden>{m.sticker ?? '🎲'}</span>}
            <b>{m.pseudo}</b>
            <span className="role">{m.role}</span>
            {isCreator && m.id !== meId && (
              <button type="button" className={`kick ${armedKick === m.id ? 'armed' : ''}`}
                      aria-label={armedKick === m.id ? `Sûr ? Retirer ${m.pseudo} du foyer` : `Retirer ${m.pseudo} du foyer`}
                      disabled={busy} onClick={() => kick(m.id)}>
                {armedKick === m.id ? 'Sûr ? Retirer' : '✕'}
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="code-zone">
        <span className="code">{foyer.invite_code}</span>
        <button type="button" onClick={copyCode}>{copied ? 'Copié ✓' : 'Copier'}</button>
      </div>
      <p className="foyer-hint">Pour inviter quelqu&apos;un qui joue sous ce toit : dictez-lui ce code, il le saisit dans son profil.</p>
      <button type="button" className={`btn-ghost danger ${armed === 'leave' ? 'armed' : ''}`} disabled={busy}
              onClick={() => act('leave')}>
        {armed === 'leave' ? 'Sûr ? Quitter' : 'Quitter le foyer'}
      </button>
      {isCreator && (
        <button type="button" className={`btn-ghost danger ${armed === 'dissolve' ? 'armed' : ''}`} disabled={busy}
                onClick={() => act('dissolve')}>
          {armed === 'dissolve' ? 'Sûr ? Dissoudre' : 'Dissoudre le foyer'}
        </button>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
