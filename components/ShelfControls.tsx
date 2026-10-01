'use client';
import { useState } from 'react';
import type { ShelfFilters } from '@/lib/filters';
import { FORMATS, FORMAT_SHORT } from '@/lib/formats';

const WEIGHTS: [ShelfFilters['weight'], string][] = [['leger', 'Légère'], ['moyen', 'Moyenne'], ['lourd', 'Lourde']];
const DURATIONS: [ShelfFilters['duration'], string][] = [['court', '< 30'], ['moyen', '30–60'], ['long', '60+']];
const BOX: [NonNullable<ShelfFilters['format']>, string][] = FORMATS.map((f) => [f, FORMAT_SHORT[f]]);

const NEUTRAL: ShelfFilters = { q: '', players: null, weight: 'all', duration: 'all', format: 'all' };

// Recherche + filtres partagés (étagère, ludothèque). Par défaut, repliés en une
// rangée : la liste est le héros. Le badge compte les familles de filtres actives.
export default function ShelfControls({ filters, setFilters, visible, total, withFormat = false, countHint = 'disponibles ce soir' }: {
  filters: ShelfFilters;
  setFilters: (f: ShelfFilters) => void;
  visible: number;
  total: number;
  /** Familles Boîte : pour la ludothèque (l'étagère groupe déjà ses blocs par format). */
  withFormat?: boolean;
  countHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const activeCount =
    (filters.players != null ? 1 : 0) +
    (filters.weight !== 'all' ? 1 : 0) +
    (filters.duration !== 'all' ? 1 : 0) +
    (filters.format !== 'all' ? 1 : 0);
  return (
    <div className="collection-controls">
      <div className="controls-row">
        <input className="shelf-search" type="search" placeholder="Rechercher un jeu…"
               aria-label="Rechercher un jeu" value={filters.q}
               onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <button type="button" className="fbtn" aria-expanded={open}
                onClick={() => setOpen((o) => !o)}>
          Filtres {activeCount > 0 && <span className="badge">{activeCount}</span>}
        </button>
      </div>
      {open && (
        <div className="fam-row">
          <div className="fam" role="group" aria-label="Filtrer par nombre de joueurs">
            <span className="fam-k">Joueurs</span>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button key={n} type="button" className={`fchip ${filters.players === n ? 'on' : ''}`}
                      onClick={() => setFilters({ ...filters, players: filters.players === n ? null : n })}>{n}</button>
            ))}
          </div>
          <div className="fam" role="group" aria-label="Filtrer par complexité">
            <span className="fam-k">Complexité</span>
            {WEIGHTS.map(([v, label]) => (
              <button key={v} type="button" className={`fchip ${filters.weight === v ? 'on' : ''}`}
                      onClick={() => setFilters({ ...filters, weight: filters.weight === v ? 'all' : v })}>{label}</button>
            ))}
          </div>
          <div className="fam" role="group" aria-label="Filtrer par durée">
            <span className="fam-k">Durée</span>
            {DURATIONS.map(([v, label]) => (
              <button key={v} type="button" className={`fchip ${filters.duration === v ? 'on' : ''}`}
                      onClick={() => setFilters({ ...filters, duration: filters.duration === v ? 'all' : v })}>{label} min</button>
            ))}
          </div>
          {withFormat && (
            <div className="fam" role="group" aria-label="Filtrer par format de boîte">
              <span className="fam-k">Boîte</span>
              {BOX.map(([v, label]) => (
                <button key={v} type="button" className={`fchip ${filters.format === v ? 'on' : ''}`}
                        onClick={() => setFilters({ ...filters, format: filters.format === v ? 'all' : v })}>{label}</button>
              ))}
            </div>
          )}
          <p className="shelf-count" role="status">
            {visible} jeu{visible > 1 ? 'x' : ''} sur {total}{countHint ? ` ${countHint}` : ''}
            {activeCount > 0 && (
              <button type="button" className="link-btn" onClick={() => setFilters({ ...NEUTRAL })}>Tout afficher</button>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
