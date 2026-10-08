'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FORMATS, formatLabel, formatShort, coverSrc } from '@/lib/formats';
import { formatNombre } from '@/lib/i18n/format';
import { filterShelf, type ShelfFilters } from '@/lib/filters';
import type { Game, UserLite } from '@/lib/types';
import { useI18n } from './LanguageProvider';
import GameSheet from './GameSheet';
import ShelfControls from './ShelfControls';
import UserMenu from './UserMenu';

export default function LibraryClient({ games: initial, plays, verdicts, me, foyer = null, bienvenue = false }: {
  games: Game[];
  plays: Record<number, number>;
  verdicts: Record<number, { adore: number; bien: number; neutre: number }>;
  me: UserLite;
  foyer?: { name: string; members: number } | null;
  bienvenue?: boolean;
}) {
  const router = useRouter();
  const { lang, t } = useI18n();
  const [games, setGames] = useState(initial);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyCovers, setBusyCovers] = useState(false);
  const [detail, setDetail] = useState<Game | null>(null);
  const [filters, setFilters] = useState<ShelfFilters>({ q: '', players: null, weight: 'all', duration: 'all', format: 'all' });
  const filtered = useMemo(() => filterShelf(games, filters), [games, filters]);
  // Alerte d'arrivée depuis l'onboarding (v4.18.0), affichée une seule fois :
  // ?bienvenue=1 est retiré de l'URL sans re-rendu serveur (router.replace l'effacerait).
  const [alerte, setAlerte] = useState(bienvenue);
  useEffect(() => { if (bienvenue) window.history.replaceState(null, '', '/library'); }, [bienvenue]);

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

  // Pochettes manquantes (v4.5.0) : un jeu BGG sans image téléchargée.
  // Le bouton n'apparaît que s'il y en a — la boucle serveur est gardée 1 req/s.
  const manquantes = games.filter((g) => g.bgg_id != null && !coverSrc(g)).length;
  async function recupererCovers() {
    setBusyCovers(true);
    try {
      const res = await fetch('/api/games/recuperer-covers', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setNotice(t('ludotheque.coversFaites', { n: data.faites }));
        setGames((await (await fetch('/api/games')).json()).games);
        router.refresh();
      }
    } finally { setBusyCovers(false); }
  }

  return (
    <div>
      <div className="page-head">
        <h1>{t('ludotheque.titre')} <small>{t('ludotheque.nbJeux', { n: games.length })}</small></h1>
        <UserMenu me={me} />
      </div>
      {manquantes > 0 && (
        <button type="button" className="btn-ghost covers-btn" disabled={busyCovers} onClick={recupererCovers}>
          {busyCovers ? t('ludotheque.coversEncours') : t('ludotheque.recupererCovers')}
        </button>
      )}
      {foyer && (
        <div className="foyer-line">{t('ludotheque.foyerAvant')}<b>{foyer.name}</b>{t('ludotheque.foyerApres', { n: foyer.members })}</div>
      )}
      {alerte && (
        <div className="alerte-once" role="status">
          {t(games.length ? 'ludotheque.alertePrete' : 'ludotheque.alerteBienvenue')} {t('ludotheque.alerteSuite')}
          <button type="button" aria-label={t('ludotheque.alerteFermer')} onClick={() => setAlerte(false)}>✕</button>
        </div>
      )}
      {notice && <p className="hint" role="alert">{notice}</p>}
      {games.length === 0 && (
        <p className="empty">{t('ludotheque.vide')}</p>
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
                      aria-label={t('ludotheque.voirFicheAria', { j: g.title })}>
                <span className="lib-cover">
                  {coverSrc(g)
                    ? <img src={coverSrc(g) as string} alt="" loading="lazy" decoding="async" />
                    : <span className="cover-placeholder" aria-hidden>♟</span>}
                  {g.owner_pseudo && (
                    <span className="who" title={t('ludotheque.ajoutePar', { p: g.owner_pseudo })}>
                      {g.owner_sticker ?? g.owner_pseudo[0]?.toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="lib-info">
                  <strong>{g.title}</strong>
                  {(g.year || g.publisher) && (
                    <span className="lib-meta">{g.year ?? '—'} · {g.publisher ?? '—'}</span>
                  )}
                  <span className="traits">
                    <span className="fmt">{formatShort(g.box_format, lang)}</span>
                    {g.min_players != null && g.max_players != null && (
                      <span>👥 {g.min_players === g.max_players ? g.min_players : `${g.min_players}–${g.max_players}`}</span>
                    )}
                    {g.playtime_min != null && <span>⏱ {g.playtime_min} min</span>}
                    {g.weight != null && <span>⚖ {formatNombre(lang, g.weight, { maximumFractionDigits: 1 })}</span>}
                  </span>
                </span>
              </button>
              <button type="button" className="lib-rm" aria-label={t('ludotheque.retirerAria', { j: g.title })} onClick={() => remove(g.id)}>✕</button>
            </div>
            <div className="lib-act">
              <select className="lib-fmt" value={g.box_format} aria-label={t('ludotheque.fmtAria', { j: g.title })}
                      onChange={(e) => setFormat(g.id, e.target.value)}>
                {FORMATS.map((f) => <option key={f} value={f}>{formatLabel(f, lang)}</option>)}
              </select>
            </div>
          </li>
        ))}
      </ul>
      {games.length > 0 && filtered.length === 0 && (
        <p className="lib-empty">{t('ludotheque.videFiltres')}</p>
      )}
      {detail && (
        <GameSheet game={detail} players={[]} playsCount={plays[detail.id] ?? 0}
                   verdicts={verdicts[detail.id]}
                   onClose={() => setDetail(null)}
                   mode="library" />
      )}
    </div>
  );
}
