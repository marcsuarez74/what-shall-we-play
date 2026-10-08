'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { classerManche, grouperManches, type Declaration } from '@/lib/manches';
import { medaille } from '@/lib/ranks';
import { formatNombre } from '@/lib/i18n/format';
import { useI18n } from './LanguageProvider';

// v4.19.0 — choix libre : dans la fiche d'un jeu, un bloc par manche (classement, joueurs
// sans score à part, MA déclaration), « J'ai joué cette manche » et « 🔁 Nouvelle manche ».
// Chacun ne déclare, modifie ou retire que SA ligne ; le serveur garde les mêmes règles.
export default function MancheBlocs({ nightId, gameId, plays, meId, vetoPar }: {
  nightId: number; gameId: number; plays: Declaration[]; meId: number; vetoPar: string | null;
}) {
  const router = useRouter();
  const { lang, t } = useI18n();
  const manches = grouperManches(plays.filter((p) => p.game_id === gameId)).sort((a, b) => a.manche - b.manche);
  const derniere = manches.at(-1)?.manche ?? 0;
  const [saisie, setSaisie] = useState<number | null>(null); // manche en cours de saisie
  const [score, setScore] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function ouvrir(manche: number) {
    const mien = plays.find((p) => p.game_id === gameId && p.manche === manche && p.user_id === meId);
    setScore(mien?.score != null ? String(mien.score) : '');
    setError('');
    setSaisie(manche);
  }
  async function envoyer(method: 'POST' | 'DELETE', manche: number) {
    setBusy(true); setError('');
    const res = await fetch(`/api/nights/${nightId}/plays`, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(method === 'POST'
        ? { gameId, manche, score: score.trim() === '' ? null : Number(score.replace(',', '.')) }
        : { gameId, manche }),
    });
    setBusy(false);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? t('libre.errManche')); return; }
    setSaisie(null);
    router.refresh();
  }

  const formulaire = (manche: number) => (
    <form className="joue-form" onSubmit={(e) => { e.preventDefault(); envoyer('POST', manche); }}>
      <label className="sous-label" htmlFor={`score-${gameId}-${manche}`}>{t('libre.monScore')} <span className="hint">{t('libre.monScoreAide')}</span></label>
      <div className="ligne">
        <input id={`score-${gameId}-${manche}`} inputMode="decimal" placeholder={t('libre.exScore')} value={score}
               onChange={(e) => setScore(e.target.value)} autoFocus />
        <button type="submit" className="btn-copper" disabled={busy}>{t('libre.valider')}</button>
      </div>
      <button type="button" className="link-btn" onClick={() => setSaisie(null)}>{t('libre.annuler')}</button>
    </form>
  );

  if (vetoPar) return (
    <>
      <button type="button" className="btn-joue" disabled>{t('libre.jaiJoue')}</button>
      <p className="hint">{t('libre.vetoAide', { p: vetoPar })}</p>
    </>
  );
  if (manches.length === 0) return (
    <>
      {saisie === 1 ? formulaire(1) : <button type="button" className="btn-joue" onClick={() => ouvrir(1)}>{t('libre.jaiJoue')}</button>}
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
  return (
    <>
      {manches.map(({ manche, lignes }) => {
        const { classes, sansScore } = classerManche(lignes);
        const jAiJoue = lignes.some((l) => l.user_id === meId);
        return (
          <section key={manche} className="manche" aria-label={t('libre.manche', { n: manche })}>
            <div className="manche-h">
              <span>{manches.length > 1 ? t('libre.manche', { n: manche }) : t('libre.classement')}</span>
              <span>{t('libre.nJoueurs', { n: lignes.length })}</span>
            </div>
            {classes.length > 0 && (
              <ol className="classement">
                {classes.map((c) => (
                  <li key={c.user_id} className={c.user_id === meId ? 'moi' : ''}>
                    <span className="rang">{medaille(c.rank) || c.rank}</span>
                    <span>{c.pseudo}{c.user_id === meId ? ` · ${t('libre.toi')}` : ''}</span>
                    <span className="pts">{t('libre.pts', { n: formatNombre(lang, c.score ?? 0) })}</span>
                  </li>
                ))}
              </ol>
            )}
            {sansScore.length > 0 && (
              <p className="sans-score">{t('libre.sansScore')} {sansScore.map((s) => s.user_id === meId ? t('libre.toi') : s.pseudo).join(', ')}</p>
            )}
            {saisie === manche ? formulaire(manche) : jAiJoue ? (
              <div className="mini-actions">
                <button type="button" className="link-btn" onClick={() => ouvrir(manche)}>{t('libre.modifierScore')}</button>
                <button type="button" className="link-btn" disabled={busy} onClick={() => envoyer('DELETE', manche)}>{t('libre.retirer')}</button>
              </div>
            ) : (
              <button type="button" className="btn-ghost" onClick={() => ouvrir(manche)}>{t('libre.jaiJoueManche')}</button>
            )}
          </section>
        );
      })}
      {saisie === derniere + 1 ? (
        <section className="manche" aria-label={t('libre.manche', { n: derniere + 1 })}>
          <div className="manche-h"><span>{t('libre.manche', { n: derniere + 1 })} · {t('libre.nouvelle')}</span></div>
          {formulaire(derniere + 1)}
        </section>
      ) : (
        <button type="button" className="btn-ghost" onClick={() => ouvrir(derniere + 1)}>{t('libre.nouvelleManche')}</button>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}
