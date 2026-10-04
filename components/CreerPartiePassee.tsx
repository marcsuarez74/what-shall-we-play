'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Game, UserLite } from '@/lib/types';
import { useI18n } from './LanguageProvider';

// v4.2.0 — formulaire « Créer une partie passée » (maquette onglet 3) :
// date passée + jeu + participants + scores optionnels, un seul geste.
export default function CreerPartiePassee({ jeux, joueurs, moiId }: { jeux: Game[]; joueurs: UserLite[]; moiId: number }) {
  const { t } = useI18n();
  const router = useRouter();
  const hier = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE');
  const [date, setDate] = useState(hier);
  const [jeu, setJeu] = useState<number | ''>('');
  const [presents, setPresents] = useState<number[]>([moiId]);
  const [valeurs, setValeurs] = useState<Record<number, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const basculer = (id: number) => setPresents((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function creer() {
    setOccupe(true); setErr(null);
    const res = await fetch('/api/nights/retro', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playedAt: date, gameId: jeu, playerIds: presents,
        scores: Object.fromEntries(Object.entries(valeurs).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])),
      }),
    });
    setOccupe(false);
    if (!res.ok) { setErr((await res.json()).error ?? t('erreurs.impossible')); return; }
    const { nightId } = await res.json();
    router.push(`/nights/${nightId}`);
    router.refresh();
  }

  return (
    <div className="cp-form">
      <p className="corriger-note" style={{ margin: 0, textAlign: 'left' }}>{t('parties.creerPasseeIntro')}</p>
      {err && <p className="corriger-err" role="alert">{err}</p>}
      <label className="corriger-champ">{t('corriger.date')}
        <input type="date" value={date} max={new Date().toLocaleDateString('sv-SE')} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="corriger-champ">{t('corriger.jeu')}
        <select value={jeu} onChange={(e) => setJeu(Number(e.target.value))}>
          <option value="" disabled>—</option>
          {jeux.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
        </select>
      </label>
      <div className="corriger-champ">
        <span>{t('corriger.participants')}</span>
        <div className="corriger-chips">
          {joueurs.map((j) => (
            <button type="button" key={j.id} className={'corriger-chip' + (presents.includes(j.id) ? '' : ' hors')} onClick={() => basculer(j.id)}>
              {presents.includes(j.id) ? `${j.pseudo} ✕` : `${t('corriger.ajouter')} · ${j.pseudo}`}
            </button>
          ))}
        </div>
      </div>
      <div className="corriger-champ">
        <span>{t('corriger.scores')}</span>
        {presents.map((id) => {
          const j = joueurs.find((x) => x.id === id)!;
          return (
            <div className="corriger-score" key={id}>
              <span>{j.pseudo}</span>
              <input aria-label={t('corriger.scoreDe', { pseudo: j.pseudo })} inputMode="numeric" placeholder="—"
                value={valeurs[id] ?? ''} onChange={(e) => setValeurs((v) => ({ ...v, [id]: e.target.value }))} />
            </div>
          );
        })}
      </div>
      <p className="corriger-alerte">{t('parties.alerteDate')}</p>
      <button type="button" className="btn-cuivre" disabled={occupe || jeu === ''} onClick={creer}>{t('parties.creerBouton')}</button>
    </div>
  );
}
