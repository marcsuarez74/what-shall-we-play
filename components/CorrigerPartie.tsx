'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Game, UserLite } from '@/lib/types';
import { useI18n } from './LanguageProvider';

type LigneScore = { user_id: number; pseudo: string; score: number | null };
type Compteurs = { adore: number; bien: number; neutre: number };

// v4.2.0 — bloc « Corriger cette partie » de la page d'une partie terminée :
// date, jeu (alerte verdicts au changement), participants, scores ; bouton
// rouge « Supprimer » avec modale qui liste ce qui disparaît (maquette onglets 1 et 4).
export default function CorrigerPartie({ nightId, playedAt, gameId, titreJeu, joueurs, candidats, scores, jeux, compteurs, nbTirages }: {
  nightId: number;
  playedAt: string;
  gameId: number | null;
  titreJeu: string | null;
  joueurs: UserLite[];
  candidats: UserLite[];
  scores: LigneScore[];
  jeux: Game[];
  compteurs: Compteurs;
  nbTirages: number;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [date, setDate] = useState(playedAt);
  const [jeu, setJeu] = useState<number | null>(gameId ?? jeux[0]?.id ?? null); // partie sans jeu : la 1ʳᵉ boîte est présélectionnée
  const [presents, setPresents] = useState<number[]>(joueurs.map((j) => j.id));
  const [valeurs, setValeurs] = useState<Record<number, string>>(
    Object.fromEntries(joueurs.map((j) => [j.id, String(scores.find((s) => s.user_id === j.id)?.score ?? '')])));
  const [err, setErr] = useState<string | null>(null);
  const [modale, setModale] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const jeuChange = jeu !== gameId;
  const basculer = (id: number) => setPresents((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function enregistrer() {
    setOccupe(true); setErr(null);
    const res = await fetch(`/api/nights/${nightId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playedAt: date, gameId: jeu, playerIds: presents,
        scores: Object.fromEntries(Object.entries(valeurs).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])),
      }),
    });
    setOccupe(false);
    if (!res.ok) { setErr((await res.json()).error ?? t('erreurs.impossible')); return; }
    setOuvert(false);
    router.refresh();
  }

  async function supprimer() {
    setOccupe(true); setErr(null);
    const res = await fetch(`/api/nights/${nightId}`, { method: 'DELETE' });
    setOccupe(false);
    if (!res.ok) { setErr((await res.json()).error ?? t('erreurs.impossible')); setModale(false); return; }
    router.push('/nights');
    router.refresh();
  }

  const detailScores = scores.filter((s) => s.score !== null).map((s) => `${s.pseudo} ${s.score}`).join(' · ') || '—';
  const detailVerdicts = `${compteurs.adore} 😍 · ${compteurs.bien} 🙂 · ${compteurs.neutre} 😐`;
  const presentsLignes = presents.map((id) => {
    const j = joueurs.find((x) => x.id === id) ?? candidats.find((x) => x.id === id)!;
    return (
      <div className="corriger-score" key={id}>
        <span>{j.pseudo}</span>
        <input aria-label={t('corriger.scoreDe', { pseudo: j.pseudo })} inputMode="numeric"
          value={valeurs[id] ?? ''} onChange={(e) => setValeurs((v) => ({ ...v, [id]: e.target.value }))} />
      </div>
    );
  });
  const hors = candidats.filter((c) => !presents.includes(c.id));

  return (
    <>
      <div className="corriger-bloc">
        <button type="button" className="corriger-toggle" aria-expanded={ouvert}
          onClick={() => setOuvert((o) => !o)}>
          {t('corriger.titre')} {ouvert ? '▴' : '▾'}
        </button>
        {ouvert && (
          <div className="corriger-form">
            {jeuChange && <p className="corriger-alerte" role="alert">{t('corriger.alerteJeu')}</p>}
            {err && <p className="corriger-err" role="alert">{err}</p>}
            <label className="corriger-champ">{t('corriger.date')}
              <input type="date" value={date} max={new Date().toLocaleDateString('sv-SE')}
                onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="corriger-champ">{t('corriger.jeu')}
              <select value={jeu ?? ''} onChange={(e) => setJeu(Number(e.target.value))}>
                {gameId !== null && !jeux.some((g) => g.id === gameId) && <option value={gameId}>{titreJeu}</option>}
                {jeux.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
              </select>
            </label>
            <div className="corriger-champ">
              <span>{t('corriger.participants')}</span>
              <div className="corriger-chips">
                {presents.map((id) => (
                  <button type="button" key={id} className="corriger-chip" onClick={() => basculer(id)}>
                    {(joueurs.find((x) => x.id === id) ?? candidats.find((x) => x.id === id))!.pseudo} ✕
                  </button>
                ))}
                {hors.map((c) => (
                  <button type="button" key={c.id} className="corriger-chip hors" onClick={() => basculer(c.id)}>
                    {t('corriger.ajouter')} · {c.pseudo}
                  </button>
                ))}
              </div>
            </div>
            <div className="corriger-champ">
              <span>{t('corriger.scores')}</span>
              {presentsLignes}
            </div>
            <button type="button" className="btn-cuivre" disabled={occupe} onClick={enregistrer}>{t('corriger.enregistrer')}</button>
          </div>
        )}
      </div>
      <button type="button" className="btn-rouge" onClick={() => setModale(true)}>{t('corriger.supprimer')}</button>
      <p className="corriger-note">{t('corriger.droits')}</p>
      {modale && (
        <div className="corriger-voile" role="dialog" aria-label={t('corriger.modaleTitre')}>
          <div className="corriger-modale">
            <h3>{t('corriger.modaleTitre')}</h3>
            <p>{t('corriger.modaleIntro')}</p>
            <ul>
              <li>{t('corriger.modaleScores', { detail: detailScores })}</li>
              <li>{t('corriger.modaleVerdicts', { detail: detailVerdicts })}</li>
              <li>{t('corriger.modaleTirage', { detail: nbTirages })}</li>
            </ul>
            <p>{t('corriger.modaleStats')}</p>
            <div className="corriger-actions">
              <button type="button" onClick={() => setModale(false)}>{t('corriger.garder')}</button>
              <button type="button" className="btn-rouge corriger-confirmer" disabled={occupe} onClick={supprimer}>{t('corriger.confirmerSupprimer')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
