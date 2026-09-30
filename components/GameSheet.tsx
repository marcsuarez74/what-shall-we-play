'use client';
import { useEffect } from 'react';
import { FORMAT_LABEL, coverSrc } from '@/lib/formats';
import type { Game, UserLite } from '@/lib/types';

const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

export default function GameSheet({ game, players, playsCount, inSelection, onToggle, onClose }: {
  game: Game;
  players: UserLite[];
  playsCount: number;
  inSelection: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const owner = players.find((p) => p.id === game.owner_id)?.pseudo;
  const joueurs = game.min_players && game.max_players
    ? (game.min_players === game.max_players ? `${game.min_players}` : `${game.min_players}–${game.max_players}`)
    : null;
  const cover = coverSrc(game);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="bottom-sheet" role="dialog" aria-modal="true" aria-label={game.title}
           onClick={(e) => e.stopPropagation()}>
        <button type="button" className="sheet-close" aria-label="Fermer" onClick={onClose}>✕</button>
        <div className="sheet-head">
          {cover
            ? <img className="sheet-cover" src={cover} alt={game.title} />
            : <div className="sheet-cover cover-placeholder">♟</div>}
          <div className="sheet-titles">
            <h2>{game.title}</h2>
            {(game.year != null || game.publisher) && (
              <p className="sheet-meta">{[game.year, game.publisher].filter(Boolean).join(' · ')}</p>
            )}
          </div>
        </div>
        <div className="chips">
          {joueurs && <span className="chip">👥 {joueurs}</span>}
          {game.playtime_min != null && <span className="chip">⏱ {game.playtime_min} min</span>}
          {game.weight != null && <span className="chip">⚖ {fmt(game.weight)} / 5</span>}
          {game.bgg_rating != null && <span className="chip">⭐ {fmt(game.bgg_rating)} / 10</span>}
        </div>
        <ul className="sheet-facts">
          {game.weight != null && (
            <li><span>Complexité (BGG)</span><strong>⚖ {fmt(game.weight)} / 5</strong></li>
          )}
          {game.best_players != null && (
            <li><span>Best joueurs (BGG)</span><strong>{game.best_players}</strong></li>
          )}
          {game.designer && <li><span>Créateur</span><strong>{game.designer}</strong></li>}
          {game.artist && <li><span>Illustrateur</span><strong>{game.artist}</strong></li>}
          <li><span>Parties jouées</span><strong>{playsCount}</strong></li>
        </ul>
        <p className="sheet-owner">
          Apporté par <strong>{owner ?? 'un joueur'}</strong> · {FORMAT_LABEL[game.box_format]}
        </p>
        {game.bgg_id != null && (
          <a className="bgg-link" href={`https://boardgamegeek.com/boardgame/${game.bgg_id}`}
             target="_blank" rel="noreferrer">
            <img className="bgg-logo" src="/logos/powered-by-bgg.svg" alt="Powered by BoardGameGeek" />
            <span>Voir la fiche ↗</span>
          </a>
        )}
        <button type="button" className={`btn-copper ${inSelection ? 'is-sel' : ''}`} onClick={onToggle}>
          {inSelection ? '✓ Retirer de la sélection' : '＋ Ajouter à la sélection'}
        </button>
      </div>
    </div>
  );
}
