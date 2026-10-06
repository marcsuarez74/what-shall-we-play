'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Night, UserLite } from '@/lib/types';
import PlayerChip from './PlayerChip';
import { useI18n } from './LanguageProvider';

export type CerclePicker = { id: number; nom: string; membres: number[] };

export default function NightPicker({ users, prechecked, night, withDate = false, editInfos, onClose, meId, cercles = [] }: {
  users: UserLite[];
  /** v4.8.0 — moi : toujours joueur, case cochée et figée. */
  meId?: number;
  /** v4.8.0 — programmer : cocher un cercle coche ses membres (puis on ajuste à la main). */
  cercles?: CerclePicker[];
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
  const [cerclesCoches, setCerclesCoches] = useState<Set<number>>(() => new Set());
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

  function toggleCercle(c: CerclePicker) {
    const on = !cerclesCoches.has(c.id);
    setCerclesCoches((s) => { const n = new Set(s); if (on) n.add(c.id); else n.delete(c.id); return n; });
    setChecked((s) => {
      const n = new Set(s);
      for (const id of c.membres) if (id !== meId) { if (on) n.add(id); else n.delete(id); }
      return n;
    });
  }
  const nbInvitations = [...checked].filter((id) => id !== meId).length;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (avecDate && !date) { setError(t('soiree.choisirDate')); return; }
    setBusy(true); setError(null);
    const res = await fetch(night ? `/api/nights/${night.id}` : '/api/nights', {
      method: night ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerIds: [...checked],
        ...(withDate ? { cercleIds: [...cerclesCoches] } : {}),
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
      {withDate && cercles.length > 0 && (
        <>
          <p className="hint">{t('soiree.inviterCercle')}</p>
          <ul className="player-list">
            {cercles.map((c) => (
              <li key={c.id}>
                <label>
                  <input type="checkbox" checked={cerclesCoches.has(c.id)} onChange={() => toggleCercle(c)} />
                  <span className="picker-cercle"><b>{c.nom}</b> <small>{t('cercles.personnes', { n: c.membres.filter((id) => id !== meId).length })}</small></span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="hint">{withDate && cercles.length > 0 ? t('soiree.ouDesAmis') : t('soiree.quiJoue')}</p>
      <ul className="player-list">
        {users.map((u) => (
          <li key={u.id}>
            <label>
              <input type="checkbox" checked={u.id === meId || checked.has(u.id)} disabled={u.id === meId}
                     onChange={() => toggle(u.id)} />
              <span><PlayerChip u={u} />{u.id === meId && <small className="opt"> {t('soiree.toiJoueur')}</small>}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="hint">{t('soiree.seulsAmis')}{withDate && <> {t('soiree.nbInvitations', { n: nbInvitations })}</>}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="night-actions">
        {onClose && <button type="button" className="btn-ghost" onClick={onClose}>{t('soiree.annuler')}</button>}
        <button className="btn-copper" disabled={busy}>
          {busy ? t('etagere.enregistrement') : night ? t('soiree.enregistrer') : withDate ? t('soiree.programmerInviter') : t('soiree.creerPartie')}
        </button>
      </div>
    </form>
  );
}
