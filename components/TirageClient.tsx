'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { coverSrc } from '@/lib/formats';
import type { Game } from '@/lib/types';
import { finalRotation, jitterFor } from '@/lib/wheel';
import { buildResultMessage, shareMessage } from '@/lib/announce';
import Wheel from './Wheel';

const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
const SPIN_MS = 3600;      // verdict après l'animation (transition 3,5 s)
const REDUCED_MS = 500;    // prefers-reduced-motion : transition 0,4 s

type Phase = 'spin' | 'verdict' | 'error';

export default function TirageClient({ nightId, games, waitingPseudos, startTime }: {
  nightId: number;
  games: Game[];
  waitingPseudos: string[];
  startTime: string | null;
}) {
  const [phase, setPhase] = useState<Phase>('spin');
  const [picked, setPicked] = useState<Game | null>(null);
  const [rotation, setRotation] = useState(0);
  const [boxOut, setBoxOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const started = useRef(false); // un seul POST au montage (double-render strict/dev)

  // Un tirage = POST /api/draw (le hasard et l'enregistrement sont côté serveur),
  // puis la roue cosmétique atterrit sur le jeu renvoyé.
  const draw = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    setPhase('spin'); setBoxOut(false); setError(null);
    try {
      const res = await fetch('/api/draw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nightId, gameIds: games.map((g) => g.id) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Une erreur est survenue'); setPhase('error'); return; }
      const idx = games.findIndex((g) => g.id === Number(data.gameId));
      if (idx === -1) { setError('Ce jeu ne fait plus partie de la sélection'); setPhase('error'); return; }
      const count = games.length;
      const jitter = jitterFor(count); // échantillonné UNE fois par tirage (pas par rendu)
      const target = finalRotation(idx, count, jitter);
      setPicked(games[idx]);
      // Même point d'arrivée que target (mod 360), toujours ≥ 5 tours en avant
      setRotation((cur) => cur + ((((target - cur) % 360) + 360) % 360) + 5 * 360);
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      timer.current = setTimeout(() => {
        setPhase('verdict');
        navigator.vibrate?.(80);
      }, reduced ? REDUCED_MS : SPIN_MS);
    } catch {
      setError('Connexion impossible — réessayez'); setPhase('error');
    }
  }, [nightId, games]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    draw();
  }, [draw]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const joueurs = picked?.min_players && picked?.max_players
    ? (picked.min_players === picked.max_players ? `${picked.min_players}` : `${picked.min_players}–${picked.max_players}`)
    : null;
  const cover = picked ? coverSrc(picked) : null;

  return (
    <main className="tirage-screen">
      <div className="tirage-stage">
        <Wheel games={games} rotation={rotation} />
        {phase === 'spin' && <p className="tirage-hint">La roue tourne…</p>}
      </div>

      {phase === 'verdict' && picked && (
        <section className="verdict" aria-live="polite">
          <p className="verdict-kicker">LA ROUE A PARLÉ</p>
          <div className="verdict-spot">
            {cover
              ? <img src={cover} alt={picked.title} />
              : <div className="verdict-cover cover-placeholder">♟</div>}
          </div>
          <h1 className="verdict-title">{picked.title}</h1>
          <div className="chips">
            {joueurs && <span className="chip">👥 {joueurs}</span>}
            {picked.playtime_min != null && <span className="chip">⏱ {picked.playtime_min} min</span>}
            {picked.weight != null && <span className="chip">⚖ {fmt(picked.weight)} / 5</span>}
            {picked.bgg_rating != null && <span className="chip">⭐ {fmt(picked.bgg_rating)} / 10</span>}
          </div>
          <div className="verdict-actions">
            <button type="button" className={`btn-copper ${boxOut ? 'is-sel' : ''}`}
                    onClick={() => setBoxOut(true)}>
              {boxOut ? 'Boîte sortie ✓' : 'Sortir la boîte 📦'}
            </button>
            <button type="button" className="btn-ghost"
                    onClick={() => picked && shareMessage(buildResultMessage({
                      title: picked.title,
                      ownerPseudo: picked.owner_pseudo ?? '',
                      waiting: waitingPseudos.filter((p) => p !== picked.owner_pseudo),
                      time: startTime,
                    }))}>
              💬 Annoncer sur WhatsApp
            </button>
            <button type="button" className="btn-ghost" onClick={draw}>Relancer le tirage</button>
          </div>
        </section>
      )}

      {phase === 'error' && (
        <section className="verdict" aria-live="assertive">
          <p className="verdict-kicker">LE TIRAGE A DÉRAILLÉ</p>
          <p className="error" role="alert">{error}</p>
          <div className="verdict-actions">
            <a className="btn-copper" href="/etagere">Retour à l&apos;étagère</a>
          </div>
        </section>
      )}
    </main>
  );
}
