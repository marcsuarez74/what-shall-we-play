'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Night, UserLite } from '@/lib/types';
import PlayerChip from './PlayerChip';
import { useI18n } from './LanguageProvider';

export default function NightPicker({ users, prechecked, night, withDate = false, editInfos, onClose }: {
  users: UserLite[];
  prechecked: number[];
  night?: Night | null;
  /** QG Parties : ajoute les champs titre + date + heure (programmation). */
  withDate?: boolean;
  /** v4.7.0 — modification par le créateur : titre, et date + heure si la partie est programmée. */
  editInfos?: { futur: boolean };
  onClose?: () => void;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [checked, setChecked] = useState<Set<number>>(() => new Set(prechecked));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avecTitre = withDate || !!editInfos;
  const avecDate = withDate || !!editInfos?.futur;
  const [titre, setTitre] = useState(night?.titre ?? '');
  const [date, setDate] = useState(editInfos?.futur ? night?.played_at ?? '' : '');
  const [time, setTime] = useState(editInfos?.futur ? night?.start_time ?? '' : '');
  // La programmation se fait au plus tôt demain ; le jour J, la partie se crée sans date.
  // Arithmétique calendaire ( setDate) et non +24 h : sûr pendant le passage à l'heure d'été.
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const demain = d.toLocaleDateString('sv-SE');

  function toggle(id: number) {
    setChecked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (avecDate && !date) { setError(t('soiree.choisirDate')); return; }
    setBusy(true); setError(null);
    const res = await fetch(night ? `/api/nights/${night.id}` : '/api/nights', {
      method: night ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerIds: [...checked],
        ...(avecTitre ? { titre } : {}),
        ...(avecDate ? { playedAt: date, startTime: time || null } : {}),
      }),
    });
    setBusy(false);
    if (!res.ok) { setError((await res.json()).error); return; }
    onClose?.();
    router.refresh();
  }

  return (
    <form className="night-picker" onSubmit={submit}>
      <h2>{night ? t('etagere.modifierPartie') : withDate ? t('soiree.programmer') : t('soiree.nouvellePartie')}</h2>
      {avecTitre && (
        <label className="plan-titre-field">
          {t('soiree.titreLabel')} <span className="opt">{t('soiree.facultatif')}</span>
          <input type="text" value={titre} maxLength={40} placeholder={t('soiree.titrePlaceholder')}
                 onChange={(e) => setTitre(e.target.value)} />
        </label>
      )}
      {avecDate && (
        <div className="plan-fields">
          <label>
            {t('soiree.date')}
            <input type="date" min={demain} value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label>
            {t('soiree.heure')} <span className="opt">{t('soiree.facultatif')}</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>
      )}
      <p className="hint">{t('soiree.quiJoue')}</p>
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
        {onClose && <button type="button" className="btn-ghost" onClick={onClose}>{t('soiree.annuler')}</button>}
        <button className="btn-copper" disabled={busy}>
          {busy ? t('etagere.enregistrement') : night ? t('soiree.enregistrer') : withDate ? t('soiree.programmerSubmit') : t('soiree.creerPartie')}
        </button>
      </div>
    </form>
  );
}
