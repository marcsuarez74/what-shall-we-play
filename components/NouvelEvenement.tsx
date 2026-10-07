'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { UserLite } from '@/lib/types';
import type { CerclePicker } from './NightPicker';
import PlayerChip from './PlayerChip';
import { useI18n } from './LanguageProvider';

// v4.15.0 — « ＋ Nouvel événement » : titre, description, période facultative, participants
// (cercles et amis). Les participants voient l'événement ; personne n'est invité aux parties.
export default function NouvelEvenement({ users, cercles, meId }: { users: UserLite[]; cercles: CerclePicker[]; meId: number }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [periode, setPeriode] = useState(false);
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [amis, setAmis] = useState<Set<number>>(new Set());
  const [cerclesCoches, setCerclesCoches] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const bascule = (set: Set<number>, id: number) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n; };

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErreur(null);
    const r = await fetch('/api/evenements', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titre, description, du: periode ? du : null, au: periode ? au : null, playerIds: [...amis], cercleIds: [...cerclesCoches] }),
    });
    setBusy(false);
    if (!r.ok) { setErreur((await r.json().catch(() => ({}))).error ?? t('erreurs.impossible')); return; }
    router.push(`/evenements/${(await r.json()).id}`);
  }

  return (
    <>
      <button type="button" className="btn-copper" onClick={() => setOpen(true)}>{t('evt.nouveau')}</button>
      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <form className="bottom-sheet night-picker" onClick={(e) => e.stopPropagation()} onSubmit={creer}
                role="dialog" aria-modal="true" aria-label={t('evt.nouveau')}>
            <h2>{t('evt.nouveau').replace('＋ ', '')}</h2>
            <label className="plan-titre-field">{t('soiree.titreLabel')}
              <input type="text" value={titre} maxLength={40} required onChange={(e) => setTitre(e.target.value)} />
            </label>
            <label className="plan-titre-field">{t('evt.description')} <span className="opt">{t('soiree.facultatif')}</span>
              <input type="text" value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <label className="repeter-case">
              <input type="checkbox" checked={periode} onChange={(e) => setPeriode(e.target.checked)} /> {t('evt.definirPeriode')}
            </label>
            {periode && (
              <div className="plan-fields">
                <label>{t('evt.du')}<input type="date" value={du} required onChange={(e) => setDu(e.target.value)} /></label>
                <label>{t('evt.au')}<input type="date" value={au} min={du || undefined} required onChange={(e) => setAu(e.target.value)} /></label>
              </div>
            )}
            <p className="hint">{t('evt.participants')}</p>
            <ul className="player-list">
              {cercles.map((c) => (
                <li key={`c${c.id}`}><label>
                  <input type="checkbox" checked={cerclesCoches.has(c.id)} onChange={() => setCerclesCoches((s) => bascule(s, c.id))} />
                  <span className="picker-cercle"><b>{c.nom}</b> <small>{t('cercles.personnes', { n: c.membres.filter((id) => id !== meId).length })}</small></span>
                </label></li>
              ))}
              {users.filter((u) => u.id !== meId).map((u) => (
                <li key={u.id}><label>
                  <input type="checkbox" checked={amis.has(u.id)} onChange={() => setAmis((s) => bascule(s, u.id))} />
                  <span><PlayerChip u={u} /></span>
                </label></li>
              ))}
            </ul>
            <p className="hint">{t('evt.aideParticipants')}</p>
            {erreur && <p className="error" role="alert">{erreur}</p>}
            <div className="night-actions">
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>{t('soiree.annuler')}</button>
              <button className="btn-copper" disabled={busy}>{busy ? t('etagere.enregistrement') : t('evt.creer')}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
