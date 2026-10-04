'use client';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FORMATS, formatLabel } from '@/lib/formats';
import { filterShelf, type ShelfFilters } from '@/lib/filters';
import type { Game } from '@/lib/types';
import BoxImage from './BoxImage';
import ShelfControls from './ShelfControls';
import { useI18n } from './LanguageProvider';

// Sélecteur « Ajouter à la partie » : MA ludothèque (jeux perso + ceux de mon foyer),
// groupée par format, recherche + filtres identiques à l'étagère. Un tap = un ajout/retrait.
export default function ShelfPicker({ nightId, myLibrary, shelfIds, onClose }: {
  nightId: number; myLibrary: Game[]; shelfIds: number[]; onClose: () => void;
}) {
  const router = useRouter();
  const { lang, t } = useI18n();
  const [busy, setBusy] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [filters, setFilters] = useState<ShelfFilters>({ q: '', players: null, weight: 'all', duration: 'all', format: 'all' });
  const added = useMemo(() => new Set(shelfIds), [shelfIds]);

  // Les mêmes filtres que l'étagère (un jeu sans donnée n'est jamais écarté).
  const visibles = useMemo(() => filterShelf(myLibrary, filters), [myLibrary, filters]);
  const byFormat = useMemo(() => FORMATS.map((f) => ({
    f,
    list: visibles.filter((g) => g.box_format === f),
  })).filter(({ list }) => list.length > 0), [visibles]);

  async function toggle(g: Game) {
    // Une rangée se désactive elle-même pendant son POST ; les autres restent
    // cliquables (deux taps rapides ne doivent jamais perdre un ajout).
    const liste = listRef.current;
    const scrollAvant = liste?.scrollTop ?? 0;
    setBusy(g.id);
    await fetch(`/api/nights/${nightId}/games`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: g.id, added: !added.has(g.id) }),
    });
    setBusy((b) => (b === g.id ? null : b));
    router.refresh();
    // v3.1 : certains navigateurs tactiles font sauter le défilement de la
    // feuille quand la page se rafraîchit — on remet la liste exactement où
    // le joueur l'avait laissée.
    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = scrollAvant;
    });
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="bottom-sheet picker-sheet" role="dialog" aria-modal="true" aria-label={t('etagere.ajouterPartie')}
           onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h3>{t('etagere.ajouterPartie')}</h3>
          <button type="button" className="sheet-close" aria-label={t('etagere.fermer')} onClick={onClose}>✕</button>
        </div>
        <p className="sheet-sub">{t('etagere.pickerSub')}</p>
        <ShelfControls filters={filters} setFilters={setFilters} visible={visibles.length} total={myLibrary.length}
                       withFormat countHint={t('etagere.dansMaLudo')} />
        <div className="pick-list" ref={listRef}>
          {byFormat.map(({ f, list }) => (
            <div key={f} className="fmt-group">
              <div className="fmt-k">{formatLabel(f, lang)}</div>
              {list.map((g) => (
                <div key={g.id} className="pick-row">
                  <span className="cov"><BoxImage game={g} /></span>
                  <span className="pick-meta">
                    <b>{g.title}</b>
                    <span className="who">{g.foyer_id != null ? t('etagere.duFoyer') : t('etagere.perso')}{g.playtime_min ? ` · ${g.playtime_min} min` : ''}</span>
                  </span>
                  <button type="button" className={`add ${added.has(g.id) ? 'on' : ''}`}
                          disabled={busy === g.id}
                          aria-label={added.has(g.id) ? t('etagere.retirerAria', { j: g.title }) : t('etagere.ajouterJeuAria', { j: g.title })}
                          onClick={() => toggle(g)}>
                    {added.has(g.id) ? '✓' : '+'}
                  </button>
                </div>
              ))}
            </div>
          ))}
          {byFormat.length === 0 && <p className="pick-empty">{t('etagere.pickerVide')}</p>}
        </div>
        <div className="sheet-foot">
          <span className="count">{added.size === 0 ? t('etagere.aucunAjoute') : t('etagere.nbAjoutes', { n: added.size })}</span>
          <button type="button" className="btn-copper" onClick={onClose}>{t('etagere.termine')}</button>
        </div>
      </div>
    </div>
  );
}
