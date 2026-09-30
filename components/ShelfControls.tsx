'use client';
import type { ShelfFilters } from '@/lib/filters';

const WEIGHTS: [ShelfFilters['weight'], string][] = [['leger', 'Légère'], ['moyen', 'Moyenne'], ['lourd', 'Lourde']];
const DURATIONS: [ShelfFilters['duration'], string][] = [['court', '< 30'], ['moyen', '30–60'], ['long', '60+']];

// Recherche + filtres (un choix par famille, re-tap = désactiver). Les joueurs sont
// pré-filtrés sur la taille de la soirée — on cherche ce qui est jouable maintenant.
export default function ShelfControls({ filters, setFilters, visible, total }: {
  filters: ShelfFilters;
  setFilters: (f: ShelfFilters) => void;
  visible: number;
  total: number;
}) {
  const player = (n: number) => setFilters({ ...filters, players: filters.players === n ? null : n });
  return (
    <div className="shelf-controls">
      <input className="shelf-search" type="search" placeholder="Rechercher un jeu…"
             aria-label="Rechercher un jeu" value={filters.q}
             onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
      <div className="fam" role="group" aria-label="Filtrer par nombre de joueurs">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <button key={n} type="button" className={`fchip ${filters.players === n ? 'on' : ''}`}
                  onClick={() => player(n)}>{n}</button>
        ))}
      </div>
      <div className="fam" role="group" aria-label="Filtrer par complexité">
        {WEIGHTS.map(([v, label]) => (
          <button key={v} type="button" className={`fchip ${filters.weight === v ? 'on' : ''}`}
                  onClick={() => setFilters({ ...filters, weight: filters.weight === v ? 'all' : v })}>{label}</button>
        ))}
      </div>
      <div className="fam" role="group" aria-label="Filtrer par durée">
        {DURATIONS.map(([v, label]) => (
          <button key={v} type="button" className={`fchip ${filters.duration === v ? 'on' : ''}`}
                  onClick={() => setFilters({ ...filters, duration: filters.duration === v ? 'all' : v })}>{label} min</button>
        ))}
      </div>
      <p className="shelf-count" role="status">
        {visible} jeu{visible > 1 ? 'x' : ''} sur {total} disponibles ce soir
      </p>
    </div>
  );
}
