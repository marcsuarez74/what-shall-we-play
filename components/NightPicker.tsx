'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Night, UserLite } from '@/lib/types';
import PlayerChip from './PlayerChip';

export default function NightPicker({ users, prechecked, night, withDate = false, onClose }: {
  users: UserLite[];
  prechecked: number[];
  night?: Night | null;
  /** QG Soirées : ajoute les champs date + heure (programmation). */
  withDate?: boolean;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState<Set<number>>(() => new Set(prechecked));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  // La programmation se fait au plus tôt demain ; le jour J, la soirée se crée sans date.
  const demain = new Date(Date.now() + 86_400_000).toLocaleDateString('sv-SE');

  function toggle(id: number) {
    setChecked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (withDate && !date) { setError('Choisissez une date'); return; }
    setBusy(true); setError(null);
    const res = await fetch(night ? `/api/nights/${night.id}` : '/api/nights', {
      method: night ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerIds: [...checked],
        ...(withDate ? { playedAt: date, startTime: time || null } : {}),
      }),
    });
    setBusy(false);
    if (!res.ok) { setError((await res.json()).error); return; }
    onClose?.();
    router.refresh();
  }

  return (
    <form className="night-picker" onSubmit={submit}>
      <h2>{night ? 'Modifier la soirée' : withDate ? 'Programmer une soirée' : 'Nouvelle soirée'}</h2>
      {withDate && (
        <div className="plan-fields">
          <label>
            Date
            <input type="date" min={demain} value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label>
            Heure <span className="opt">(facultatif)</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>
      )}
      <p className="hint">Qui joue ce soir&nbsp;? Cochez les joueurs présents.</p>
      <ul className="player-list">
        {users.map((u) => (
          <li key={u.id}>
            <label>
              <input type="checkbox" checked={checked.has(u.id)} onChange={() => toggle(u.id)} />
              <span><PlayerChip u={u} /></span>
            </label>
          </li>
        ))}
      </ul>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="night-actions">
        {onClose && <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>}
        <button className="btn-copper" disabled={busy}>
          {busy ? 'Enregistrement…' : night ? 'Enregistrer' : withDate ? 'Programmer' : 'Créer la soirée'}
        </button>
      </div>
    </form>
  );
}
