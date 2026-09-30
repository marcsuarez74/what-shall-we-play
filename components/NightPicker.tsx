'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Night, UserLite } from '@/lib/types';

export default function NightPicker({ users, prechecked, night, onClose }: {
  users: UserLite[];
  prechecked: number[];
  night?: Night | null;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState<Set<number>>(() => new Set(prechecked));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: number) {
    setChecked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = await fetch(night ? `/api/nights/${night.id}` : '/api/nights', {
      method: night ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerIds: [...checked] }),
    });
    setBusy(false);
    if (!res.ok) { setError((await res.json()).error); return; }
    onClose?.();
    router.refresh();
  }

  return (
    <form className="night-picker" onSubmit={submit}>
      <h2>{night ? 'Modifier la soirée' : 'Nouvelle soirée'}</h2>
      <p className="hint">Qui joue ce soir&nbsp;? Cochez les joueurs présents.</p>
      <ul className="player-list">
        {users.map((u) => (
          <li key={u.id}>
            <label>
              <input type="checkbox" checked={checked.has(u.id)} onChange={() => toggle(u.id)} />
              <span>🎲 {u.pseudo}</span>
            </label>
          </li>
        ))}
      </ul>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="night-actions">
        {onClose && <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>}
        <button className="btn-copper" disabled={busy}>
          {busy ? 'Enregistrement…' : night ? 'Enregistrer' : 'Créer la soirée'}
        </button>
      </div>
    </form>
  );
}
