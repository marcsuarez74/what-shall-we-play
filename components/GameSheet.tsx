'use client';
import { useEffect } from 'react';
import { FORMAT_LABEL, coverSrc } from '@/lib/formats';
import type { Game, UserLite } from '@/lib/types';

const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

export default function GameSheet({ game, players, inSelection, onToggle, onClose }: {
  game: Game;
  players: UserLite[];
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
        <p className="sheet-owner">
          Apporté par <strong>{owner ?? 'un joueur'}</strong> · {FORMAT_LABEL[game.box_format]}
        </p>
        {game.bgg_id != null && (
          <a className="bgg-link" href={`https://boardgamegeek.com/boardgame/${game.bgg_id}`}
             target="_blank" rel="noreferrer">
            Voir sur BoardGameGeek ↗
          </a>
        )}
        <button type="button" className={`btn-copper ${inSelection ? 'is-sel' : ''}`} onClick={onToggle}>
          {inSelection ? '✓ Retirer de la sélection' : '＋ Ajouter à la sélection'}
        </button>
      </div>
    </div>
  );
}
