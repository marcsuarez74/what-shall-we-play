'use client';
import { useEffect } from 'react';
import { formatLabel, coverSrc } from '@/lib/formats';
import { formatNombre } from '@/lib/i18n/format';
import type { Game, UserLite } from '@/lib/types';
import { useI18n } from './LanguageProvider';
import PlayerChip from './PlayerChip';
import MancheBlocs from './MancheBlocs';
import type { Declaration } from '@/lib/manches';

export default function GameSheet({ game, players, playsCount, verdicts, onClose, mode = 'shelf', onRemoveShelf, veto, votants, libre }: {
  game: Game;
  players: UserLite[];
  playsCount: number;
  verdicts?: { adore: number; bien: number; neutre: number } | null;
  onClose: () => void;
  mode?: 'shelf' | 'library';
  onRemoveShelf?: () => void;
  /** v4.13.0 — veto ❌ : qui l'a posé (prénom), si c'est le mien, mon veto déjà posé ailleurs. */
  veto?: { par: string | null; moi: boolean; ailleurs: string | null; onToggle: () => void };
  /** v4.17.0 — qui a mis un 👍 (moi en dernier, « Toi ») ; absent = votes masqués. */
  votants?: { joueurs: UserLite[]; moiId: number };
  /** v4.19.0 — choix libre : les manches de ce jeu et ma déclaration. */
  libre?: { nightId: number; plays: Declaration[]; meId: number; vetoPar: string | null };
}) {
  const { lang, t } = useI18n();
  const fmt = (n: number) => formatNombre(lang, n, { maximumFractionDigits: 1 });
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
        <button type="button" className="sheet-close" aria-label={t('etagere.fermer')} onClick={onClose}>✕</button>
        <div className="sheet-head">
          {cover
            ? <img className="sheet-cover" src={cover} alt={game.title} decoding="async" />
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
        {votants && (
          <div className="votants">
            <p className="sous-label">{votants.joueurs.length > 0 ? t('votants.titre', { n: votants.joueurs.length }) : t('votants.aucun')}</p>
            {votants.joueurs.length > 0
              ? <div className="chips">{votants.joueurs.map((u) => u.id === votants.moiId
                  ? <span key={u.id} className="votant-moi"><PlayerChip u={{ ...u, pseudo: t('votants.toi') }} /></span>
                  : <PlayerChip key={u.id} u={u} />)}</div>
              : <p className="hint">{t('votants.aide')}</p>}
          </div>
        )}
        {libre && <MancheBlocs nightId={libre.nightId} gameId={game.id} plays={libre.plays} meId={libre.meId} vetoPar={libre.vetoPar} />}
        <ul className="sheet-facts">
          {game.weight != null && (
            <li><span>{t('fiche.complexite')}</span><strong>⚖ {fmt(game.weight)} / 5</strong></li>
          )}
          {game.best_players != null && (
            <li><span>{t('fiche.bestJoueurs')}</span><strong>{game.best_players}</strong></li>
          )}
          {game.designer && <li><span>{t('fiche.createur')}</span><strong>{game.designer}</strong></li>}
          {game.artist && <li><span>{t('fiche.illustrateur')}</span><strong>{game.artist}</strong></li>}
          <li><span>{t('fiche.partiesJouees')}</span><strong>{playsCount}</strong></li>
          {verdicts && verdicts.adore + verdicts.bien + verdicts.neutre > 0 && (
            <li><span>{t('fiche.verdictTable')}</span><strong>😍 {verdicts.adore} · 🙂 {verdicts.bien} · 😐 {verdicts.neutre}</strong></li>
          )}
        </ul>
        {mode === 'shelf' && (
          <p className="sheet-owner">
            {t('fiche.apportePar')} <strong>{owner ?? t('fiche.joueurAnonyme')}</strong> · {formatLabel(game.box_format, lang)}
          </p>
        )}
        {game.bgg_id != null && (
          <a className="bgg-link" href={`https://boardgamegeek.com/boardgame/${game.bgg_id}`}
             target="_blank" rel="noreferrer">
            <img className="bgg-logo" src="/logos/powered-by-bgg.svg" alt="Powered by BoardGameGeek" />
            <span>{t('fiche.voirBgg')}</span>
          </a>
        )}
        {veto && (veto.par && !veto.moi ? (
          <>
            <button type="button" className="btn-veto off" disabled>{t('veto.ecartePar', { p: veto.par })}</button>
            <p className="hint">{t('veto.aideAutre', { p: veto.par })}</p>
          </>
        ) : veto.moi ? (
          <>
            <button type="button" className="btn-veto off" onClick={veto.onToggle}>{t('veto.retirer')}</button>
            <p className="hint">{t('veto.aideMien')}</p>
          </>
        ) : veto.ailleurs ? (
          <>
            <button type="button" className="btn-veto off" disabled>{t('veto.mettre')}</button>
            <p className="hint">{t('veto.dejaUtilise', { j: veto.ailleurs })}</p>
          </>
        ) : (
          <>
            <button type="button" className="btn-veto" onClick={veto.onToggle}>{t('veto.mettre')}</button>
            <p className="hint">{t('veto.aide')}</p>
          </>
        ))}
        {mode === 'shelf' && onRemoveShelf && (
          <button type="button" className="btn-exclude" onClick={onRemoveShelf}>
            {t('fiche.retirerPartie')}
          </button>
        )}
      </div>
    </div>
  );
}
