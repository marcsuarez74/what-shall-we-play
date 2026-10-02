'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { coverSrc } from '@/lib/formats';
import type { Game, Night } from '@/lib/types';
import { finalRotation, jitterFor } from '@/lib/wheel';
import { buildResultMessage, shareMessage } from '@/lib/announce';
import Wheel from './Wheel';

const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
const SPIN_MS = 3600;      // verdict après l'animation (transition 3,5 s)
const REDUCED_MS = 500;    // prefers-reduced-motion : transition 0,4 s

export default function TirageClient({ nightId, games, waitingPseudos, startTime, status, partyGame }: {
  nightId: number;
  games: Game[];
  waitingPseudos: string[];
  startTime: string | null;
  status: Night['status'];
  partyGame: Game | null;
}) {
  type Phase = 'spin' | 'verdict' | 'enjeu' | 'error';
  const [phase, setPhase] = useState<Phase>(status === 'en_jeu' && partyGame ? 'enjeu' : 'spin');
  const [picked, setPicked] = useState<Game | null>(null);
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const started = useRef(false); // un seul POST au montage (double-render strict/dev)
  const router = useRouter();

  // Un tirage = POST /api/draw (le hasard et l'enregistrement sont côté serveur),
  // puis la roue cosmétique atterrit sur le jeu renvoyé.
  const draw = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    setPhase('spin'); setError(null);
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

  // Pas de nouveau tirage si la boîte est déjà sortie (rechargement, autre joueur).
  useEffect(() => {
    if (started.current || status !== 'creation') return;
    started.current = true;
    draw();
  }, [draw, status]);

  // Sync live : un AUTRE joueur sort la boîte pendant que je suis sur le verdict —
  // le refresh serveur fait passer status à 'en_jeu', l'écran se verrouille ici aussi.
  useEffect(() => {
    if (status === 'en_jeu' && partyGame) setPhase('enjeu');
  }, [status, partyGame]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // La boîte sort pour DE VRAI : POST au serveur (état 'en_jeu' partagé), puis verrou local.
  async function sortirBoite() {
    if (!picked) return;
    const res = await fetch(`/api/nights/${nightId}/box-out`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: picked.id }),
    });
    if (!res.ok) { setError((await res.json()).error ?? 'Impossible'); setPhase('error'); return; }
    setPhase('enjeu');
    navigator.vibrate?.([60, 40, 60]);
    router.refresh(); // les autres téléphones basculent via le sync live
  }

  const joueurs = picked?.min_players && picked?.max_players
    ? (picked.min_players === picked.max_players ? `${picked.min_players}` : `${picked.min_players}–${picked.max_players}`)
    : null;
  const cover = picked ? coverSrc(picked) : null;
  // enjeu : mêmes helpers appliqués à LA boîte de la partie
  const jGame = partyGame?.min_players && partyGame?.max_players
    ? (partyGame.min_players === partyGame.max_players ? `${partyGame.min_players}` : `${partyGame.min_players}–${partyGame.max_players}`)
    : null;
  const coverGame = partyGame ? coverSrc(partyGame) : null;

  return (
    <main className="tirage-screen">
      <div className={'tirage-stage' + (phase === 'enjeu' ? ' voilee' : '')}>
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
          <div className="pastille prov">jeu pressenti — remplaçable</div>
          <div className="verdict-actions">
            <button type="button" className="btn-copper" onClick={sortirBoite}>
              Sortir la boîte 📦
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
            <button type="button" className="btn-ghost" onClick={draw}>↻ Relancer le tirage</button>
          </div>
        </section>
      )}

      {phase === 'enjeu' && partyGame && (
        <section className="verdict locked" aria-live="polite">
          <p className="verdict-kicker">LA PARTIE EST LANCÉE</p>
          <div className="pastille ok">jeu de la partie ✓</div>
          <div className="verdict-spot">
            {coverGame
              ? <img src={coverGame} alt={partyGame.title} />
              : <div className="verdict-cover cover-placeholder">♟</div>}
          </div>
          <h1 className="verdict-title">{partyGame.title}</h1>
          <div className="chips">
            {jGame && <span className="chip">👥 {jGame}</span>}
            {partyGame.playtime_min != null && <span className="chip">⏱ {partyGame.playtime_min} min</span>}
            {partyGame.weight != null && <span className="chip">⚖ {fmt(partyGame.weight)} / 5</span>}
            {partyGame.bgg_rating != null && <span className="chip">⭐ {fmt(partyGame.bgg_rating)} / 10</span>}
          </div>
          <div className="verdict-actions">
            <a className="btn-copper" role="button" href={`/nights/${nightId}/scores`}>🏁 Partie terminée</a>
            <button type="button" className="btn-ghost" onClick={() => shareMessage(buildResultMessage({
              title: partyGame.title,
              ownerPseudo: partyGame.owner_pseudo ?? '',
              waiting: waitingPseudos.filter((p) => p !== partyGame.owner_pseudo),
              time: startTime,
            }))}>
              💬 Annoncer sur WhatsApp
            </button>
          </div>
          <p className="verrou-note">🔒 jeu verrouillé — la relance n&apos;existe plus</p>
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
