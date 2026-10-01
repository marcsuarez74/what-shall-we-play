'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FORMATS, FORMAT_LABEL, FORMAT_SHORT, coverSrc } from '@/lib/formats';
import { filterShelf, type ShelfFilters } from '@/lib/filters';
import type { Game } from '@/lib/types';
import GameSheet from './GameSheet';
import ShelfControls from './ShelfControls';

export default function LibraryClient({ games: initial, plays, activeNightId = null, excludedIds: initialExcluded = [] }: {
  games: Game[];
  plays: Record<number, number>;
  activeNightId?: number | null;
  excludedIds?: number[];
}) {
  const router = useRouter();
  const [games, setGames] = useState(initial);
  const [notice, setNotice] = useState<string | null>(null);
  const [detail, setDetail] = useState<Game | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set(initialExcluded));
  const [filters, setFilters] = useState<ShelfFilters>({ q: '', players: null, weight: 'all', duration: 'all', format: 'all' });
  const filtered = useMemo(() => filterShelf(games, filters), [games, filters]);

  async function toggleExclude(g: Game) {
    const nowExcluded = !excluded.has(g.id);
    setExcluded((s) => {
      const n = new Set(s);
      if (nowExcluded) n.add(g.id); else n.delete(g.id);
      return n;
    });
    await fetch(`/api/nights/${activeNightId}/excludes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: g.id, excluded: nowExcluded }),
    });
    router.refresh();
  }

  async function remove(id: number) {
    const res = await fetch(`/api/games/${id}`, { method: 'DELETE' });
    if (res.status === 409) { setNotice((await res.json()).error); return; }
    if (res.ok) {
      setGames((g) => g.filter((x) => x.id !== id));
      setNotice(null);
      setDetail((d) => (d?.id === id ? null : d));
      router.refresh();
    }
  }

  async function setFormat(id: number, box_format: string) {
    const res = await fetch(`/api/games/${id}`, { method: 'PATCH',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ box_format }) });
    if (res.ok) setGames((g) => g.map((x) => x.id === id ? { ...x, box_format: box_format as Game['box_format'] } : x));
    router.refresh();
  }

  return (
    <div>
      <h1>Ma ludothèque <small>{games.length} jeu{games.length > 1 ? 'x' : ''}</small></h1>
      {notice && <p className="hint" role="alert">{notice}</p>}
      {games.length === 0 && (
        <p className="empty">Aucun jeu pour l&apos;instant. Onglet « Ajouter » pour commencer votre étagère.</p>
      )}
      {games.length > 0 && (
        <ShelfControls filters={filters} setFilters={setFilters}
                       visible={filtered.length} total={games.length} withFormat countHint="" />
      )}
      <ul className="lib">
        {filtered.map((g) => (
          <li key={g.id} className="lib-card">
            <div className="lib-top">
              <button type="button" className="lib-main" onClick={() => setDetail(g)}
                      aria-label={`Voir la fiche de ${g.title}`}>
                <span className="lib-cover">
                  {coverSrc(g)
                    ? <img src={coverSrc(g) as string} alt="" />
                    : <span className="cover-placeholder" aria-hidden>♟</span>}
                </span>
                <span className="lib-info">
                  <strong>{g.title}</strong>
                  {(g.year || g.publisher) && (
                    <span className="lib-meta">{g.year ?? '—'} · {g.publisher ?? '—'}</span>
                  )}
                  <span className="traits">
                    <span className="fmt">{FORMAT_SHORT[g.box_format]}</span>
                    {g.min_players != null && g.max_players != null && (
                      <span>👥 {g.min_players === g.max_players ? g.min_players : `${g.min_players}–${g.max_players}`}</span>
                    )}
                    {g.playtime_min != null && <span>⏱ {g.playtime_min} min</span>}
                    {g.weight != null && <span>⚖ {g.weight.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}</span>}
                  </span>
                </span>
              </button>
              <button type="button" className="lib-rm" aria-label={`Retirer ${g.title}`} onClick={() => remove(g.id)}>✕</button>
            </div>
            <div className="lib-act">
              <select className="lib-fmt" value={g.box_format} aria-label={`Format de boîte de ${g.title}`}
                      onChange={(e) => setFormat(g.id, e.target.value)}>
                {FORMATS.map((f) => <option key={f} value={f}>{FORMAT_LABEL[f]}</option>)}
              </select>
              {activeNightId != null && (
                <button type="button" className={`lib-excl ${excluded.has(g.id) ? 'on' : ''}`}
                        aria-label={excluded.has(g.id) ? `Remettre ${g.title} au tirage ce soir` : `Écarter ${g.title} du tirage ce soir`}
                        onClick={() => toggleExclude(g)}>
                  {excluded.has(g.id) ? '✓ Écarté ce soir' : 'Pas ce soir'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {games.length > 0 && filtered.length === 0 && (
        <p className="lib-empty">Aucun jeu ne correspond aux filtres.</p>
      )}
      {detail && (
        <GameSheet game={detail} players={[]} playsCount={plays[detail.id] ?? 0}
                   inSelection={false} onToggle={() => {}} onClose={() => setDetail(null)}
                   mode="library" />
      )}
    </div>
  );
}
