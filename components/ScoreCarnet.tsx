'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { avatarSrc } from '@/lib/formats';
import { rankScores, MEDAILLES } from '@/lib/ranks';
import type { Game, UserLite } from '@/lib/types';
import BoxImage from '@/components/BoxImage';

type Deja = { user_id: number; score: number | null };

// Le carnet des scores : image du jeu, un joueur par ligne, score à droite,
// médailles placées en direct (rankScores — égalité = même médaille).
export default function ScoreCarnet({ nightId, game, players, dejaSaisis }: {
  nightId: number; game: Game; players: UserLite[]; dejaSaisis: Deja[];
}) {
  const router = useRouter();
  const [scores, setScores] = useState<Record<number, string>>(
    Object.fromEntries(players.map((p) => [p.id, String(dejaSaisis.find((d) => d.user_id === p.id)?.score ?? '')])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recalcul à chaque rendu (volontairement simple : quelques joueurs) —
  // les lignes restent dans l'ordre des joueurs, seules les médailles bougent.
  const ranks = new Map(rankScores(players.map((p) => ({ user_id: p.id, score: scores[p.id] === '' ? null : Number(scores[p.id]) })))
    .map((r) => [r.user_id, r.rank]));

  async function terminer(avecScores: boolean) {
    setBusy(true); setError(null);
    const clean: Record<string, number> = {};
    for (const [id, v] of Object.entries(scores)) if (v !== '' && Number.isFinite(Number(v))) clean[id] = Number(v);
    const res = await fetch(`/api/nights/${nightId}/end`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(avecScores ? { scores: clean } : {}),
    });
    if (!res.ok) { setError((await res.json()).error ?? 'Impossible'); setBusy(false); return; }
    router.push(`/nights/${nightId}`);
  }

  return (
    <div className="carnet-ecran">
      <div className="carnet-head">
        <span className="cov"><BoxImage game={game} /></span>
        <div><h3>{game.title}</h3><p>Le carnet des scores · {players.length} joueurs</p></div>
      </div>
      <div className="carnet">
        {players.map((p) => (
          <div key={p.id} className="carnet-row">
            <span className="avs">{avatarSrc(p) ? <img src={avatarSrc(p)!} alt="" /> : p.sticker ?? '🎲'}</span>
            <span className="ps"><b>{p.pseudo}</b></span>
            <input className="score-in" type="number" inputMode="decimal" placeholder="score"
                   value={scores[p.id] ?? ''} onChange={(e) => setScores((s) => ({ ...s, [p.id]: e.target.value }))}
                   aria-label={`Score de ${p.pseudo}`} />
            <span className={'med' + (ranks.get(p.id) && ranks.get(p.id)! <= 3 ? ' on' : '')}
                  aria-hidden="true">{MEDAILLES[(ranks.get(p.id) ?? 9) - 1] ?? ''}</span>
          </div>
        ))}
      </div>
      <p className="egalite" id="egalite">Le classement se met à jour en direct — les ex æquo portent la même médaille</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="carnet-foot">
        <button type="button" className="btn-copper" disabled={busy} onClick={() => terminer(true)}>✓ Enregistrer et terminer</button>
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => terminer(false)}>Terminer sans scores</button>
      </div>
    </div>
  );
}
