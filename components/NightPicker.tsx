'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Night, UserLite } from '@/lib/types';
import PlayerChip from './PlayerChip';
import { useI18n } from './LanguageProvider';

export type CerclePicker = { id: number; nom: string; membres: number[] };
// v4.10.0 — « Quand ? » : la partie du jour, une partie programmée, ou un sondage de dates.
export type Quand = 'now' | 'une' | 'plus';
const DATES_MAX = 6;

export default function NightPicker({ users, prechecked, night, quand = 'now', editInfos, onClose, meId, cercles = [], evenements = [], evenementId = null, datesInit, cerclesInit = [] }: {
  users: UserLite[];
  /** v4.8.0 — moi : toujours joueur, case cochée et figée. */
  meId?: number;
  /** v4.8.0 — cocher un cercle coche ses membres (puis on ajuste à la main). */
  cercles?: CerclePicker[];
  prechecked: number[];
  night?: Night | null;
  /** v4.10.0 — création : le mode présélectionné (étagère : maintenant ; Parties : une date). */
  quand?: Quand;
  /** v4.7.0 — modification par le créateur : titre, et date + heure si la partie est programmée. */
  editInfos?: { futur: boolean };
  onClose?: () => void;
  /** v4.15.0 — mes événements : la partie peut y être rattachée (création ou modification). */
  evenements?: { id: number; titre: string }[];
  evenementId?: number | null;
  /** v4.16.0 — Kijoukan : sondage prérempli (dates du créneau) et cercle coché. */
  datesInit?: { date: string; time: string }[];
  cerclesInit?: number[];
}) {
  const router = useRouter();
  const { t } = useI18n();
  const creation = !night;
  const [mode, setMode] = useState<Quand>(creation ? quand : editInfos?.futur ? 'une' : 'now');
  const [checked, setChecked] = useState<Set<number>>(() => new Set([
    ...prechecked, ...cercles.filter((c) => cerclesInit.includes(c.id)).flatMap((c) => c.membres)]));
  const [cerclesCoches, setCerclesCoches] = useState<Set<number>>(() => new Set(cerclesInit));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avecTitre = creation || !!editInfos;
  const avecDate = mode === 'une' && (creation || !!editInfos?.futur);
  const [titre, setTitre] = useState(night?.titre ?? '');
  const [date, setDate] = useState(editInfos?.futur ? night?.played_at ?? '' : '');
  const [time, setTime] = useState(editInfos?.futur ? night?.start_time ?? '' : '');
  const [dates, setDates] = useState<{ date: string; time: string }[]>(datesInit ?? [{ date: '', time: '' }, { date: '', time: '' }]);
  // v4.14.0 — « Répéter » une partie programmée : 0 = non, 1 = chaque semaine, 2 = toutes les 2 semaines.
  const [repeter, setRepeter] = useState<0 | 1 | 2>(0);
  const [places, setPlaces] = useState(''); // v4.14.1 : places max facultatives
  const [evt, setEvt] = useState<number | null>(night ? night.evenement_id ?? null : evenementId);
  const avecEvt = evenements.length > 0 && (creation || !!editInfos) && mode !== 'plus';
  // La programmation se fait au plus tôt demain ; le jour J, la partie se crée sans date.
  // Arithmétique calendaire (setDate) et non +24 h : sûr pendant le passage à l'heure d'été.
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
  const nbAutres = [...checked].filter((id) => id !== meId).length;
  const majDate = (i: number, champ: 'date' | 'time', v: string) =>
    setDates((ds) => ds.map((x, j) => (j === i ? { ...x, [champ]: v } : x)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (avecDate && !date) { setError(t('soiree.choisirDate')); return; }
    if (creation && mode === 'plus' && dates.some((x) => !x.date)) { setError(t('soiree.choisirDate')); return; }
    setBusy(true); setError(null);
    const sondage = creation && mode === 'plus';
    const res = await fetch(night ? `/api/nights/${night.id}` : sondage ? '/api/sondages' : '/api/nights', {
      method: night ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerIds: [...checked],
        ...(creation ? { cercleIds: [...cerclesCoches] } : {}),
        ...(avecTitre ? { titre } : {}),
        ...(avecDate ? { playedAt: date, startTime: time || null } : {}),
        ...(creation && mode === 'une' && repeter ? { repeter } : {}),
        ...(creation && mode === 'une' && places ? { placesMax: Number(places) } : {}),
        ...(avecEvt && (evt !== null || !creation) ? { evenementId: evt } : {}),
        ...(sondage ? { dates: dates.map((x) => ({ playedAt: x.date, startTime: x.time || null })) } : {}),
      }),
    });
    setBusy(false);
    if (!res.ok) { setError((await res.json()).error); return; }
    onClose?.();
    // Depuis l'étagère, une partie programmée ou un sondage se retrouvent dans Parties.
    if (creation && mode !== 'now' && !onClose) router.push('/nights');
    else router.refresh();
  }

  const modes: { m: Quand; label: 'quand.maintenant' | 'quand.uneDate' | 'quand.plusieurs' }[] = [
    { m: 'now', label: 'quand.maintenant' }, { m: 'une', label: 'quand.uneDate' }, { m: 'plus', label: 'quand.plusieurs' },
  ];
  return (
    <form className="night-picker" onSubmit={submit}>
      <h2>{night ? t('etagere.modifierPartie') : t('soiree.nouvellePartie')}</h2>
      {avecTitre && (
        <label className="plan-titre-field">
          {t('soiree.titreLabel')} <span className="opt">{t('soiree.facultatif')}</span>
          <input type="text" value={titre} maxLength={40} placeholder={t('soiree.titrePlaceholder')}
                 onChange={(e) => setTitre(e.target.value)} />
        </label>
      )}
      {creation && (
        <>
          <p className="hint">{t('quand.label')}</p>
          <div className="quand-seg" role="group" aria-label={t('quand.label')}>
            {modes.map(({ m, label }) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => { setMode(m); setError(null); }}>{t(label)}</button>
            ))}
          </div>
        </>
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
      {avecEvt && (
        <label className="plan-titre-field">
          {t('evt.champ')} <span className="opt">{t('soiree.facultatif')}</span>
          <select value={evt ?? ''} onChange={(e) => setEvt(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{t('evt.aucun')}</option>
            {evenements.map((x) => <option key={x.id} value={x.id}>🎪 {x.titre}</option>)}
          </select>
          {evt !== null && <span className="opt">{t('evt.aideRattache')}</span>}
        </label>
      )}
      {creation && mode === 'une' && (
        <label className="plan-titre-field">
          {t('liste.placesMax')} <span className="opt">{t('soiree.facultatif')}</span>
          <input type="number" inputMode="numeric" min={2} max={30} value={places} placeholder={t('liste.illimite')}
                 onChange={(e) => setPlaces(e.target.value)} />
        </label>
      )}
      {creation && mode === 'une' && (
        <div className="repeter">
          <label className="repeter-case">
            <input type="checkbox" checked={repeter > 0} onChange={(e) => setRepeter(e.target.checked ? 1 : 0)} />
            {t('serie.repeter')}
          </label>
          {repeter > 0 && (
            <>
              <div className="quand-seg" role="group" aria-label={t('serie.frequence')}>
                <button type="button" aria-pressed={repeter === 1} onClick={() => setRepeter(1)}>{t('serie.chaqueSemaine')}</button>
                <button type="button" aria-pressed={repeter === 2} onClick={() => setRepeter(2)}>{t('serie.deuxSemaines')}</button>
              </div>
              <p className="hint">{t('serie.aideCreation')}</p>
            </>
          )}
        </div>
      )}
      {creation && mode === 'plus' && (
        <div className="dates-sondage">
          {dates.map((x, i) => (
            <div key={i} className="date-sondage">
              <input type="date" min={demain} value={x.date} aria-label={t('sondage.dateN', { n: i + 1 })} required
                     onChange={(e) => majDate(i, 'date', e.target.value)} />
              <input type="time" value={x.time} aria-label={t('sondage.heureN', { n: i + 1 })}
                     onChange={(e) => majDate(i, 'time', e.target.value)} />
              {dates.length > 2 && (
                <button type="button" className="retirer" aria-label={t('sondage.retirerDate', { n: i + 1 })}
                        onClick={() => setDates((ds) => ds.filter((_, j) => j !== i))}>✕</button>
              )}
            </div>
          ))}
          {dates.length < DATES_MAX && (
            <button type="button" className="link-btn" onClick={() => setDates((ds) => [...ds, { date: '', time: '' }])}>{t('sondage.ajouterDate')}</button>
          )}
        </div>
      )}
      {creation && cercles.length > 0 && (
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
      <p className="hint">{creation && cercles.length > 0 ? t('soiree.ouDesAmis') : t('soiree.quiJoue')}</p>
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
      <p className="hint">
        {t('soiree.seulsAmis')}{' '}
        {creation && mode === 'now' && t('soiree.inscritsDirect')}
        {creation && mode === 'une' && t('soiree.nbInvitations', { n: nbAutres })}
        {creation && mode === 'plus' && t('sondage.aide', { d: dates.length, n: nbAutres })}
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="night-actions">
        {onClose && <button type="button" className="btn-ghost" onClick={onClose}>{t('soiree.annuler')}</button>}
        <button className="btn-copper" disabled={busy}>
          {busy ? t('etagere.enregistrement') : night ? t('soiree.enregistrer')
            : mode === 'une' ? t('soiree.programmerInviter') : mode === 'plus' ? t('sondage.envoyer') : t('soiree.creerPartie')}
        </button>
      </div>
    </form>
  );
}
