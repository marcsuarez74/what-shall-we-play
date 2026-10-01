'use client';
import type { ShelfFilters } from '@/lib/filters';
import { FORMATS } from '@/lib/formats';

const WEIGHTS: [ShelfFilters['weight'], string][] = [['leger', 'Légère'], ['moyen', 'Moyenne'], ['lourd', 'Lourde']];
const DURATIONS: [ShelfFilters['duration'], string][] = [['court', '< 30'], ['moyen', '30–60'], ['long', '60+']];
const BOX: [NonNullable<ShelfFilters['format']>, string][] = [
  ['grand', 'Grand'], ['moyen', 'Moyen'], ['petit', 'Petit'], ['mini', 'Mini'],
];

const NEUTRAL: ShelfFilters = { q: '', players: null, weight: 'all', duration: 'all', format: 'all' };

// Barre de recherche + filtres, partagée étagère et bibliothèque.
// Contrôles segmentés : un tap change de valeur, re-tap désactive.
export default function ShelfControls({ filters, setFilters, visible, total, withFormat = false, countHint = 'disponibles ce soir' }: {
  filters: ShelfFilters;
  setFilters: (f: ShelfFilters) => void;
  visible: number;
  total: number;
  /** Familles Boîte : pour la ludothèque (l'étagère groupe déjà ses blocs par format). */
  withFormat?: boolean;
  countHint?: string;
}) {
  const neutral = Object.keys(NEUTRAL).every((k) => filters[k as keyof ShelfFilters] === NEUTRAL[k as keyof ShelfFilters]);
  return (
    <div className="controls">
      <input className="shelf-search" type="search" placeholder="Rechercher un jeu…"
             aria-label="Rechercher un jeu" value={filters.q}
             onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
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
        {!neutral && <button type="button" className="link-btn" onClick={() => setFilters({ ...NEUTRAL })}>Tout afficher</button>}
      </p>
    </div>
  );
}
