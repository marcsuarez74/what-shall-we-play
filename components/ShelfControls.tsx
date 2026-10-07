'use client';
import { useState } from 'react';
import { filtresActifs, type ShelfFilters } from '@/lib/filters';
import { FORMATS, formatShort } from '@/lib/formats';
import type { CléDict } from '@/lib/i18n';
import { useI18n } from './LanguageProvider';

const WEIGHTS: Exclude<ShelfFilters['weight'], 'all'>[] = ['leger', 'moyen', 'lourd'];
// Étiquettes de durée : plages numériques (données, pas de prose). v4.12.0 : 4 plages, l'unité
// passe dans le libellé de la famille (« Durée (min) ») pour que la ligne tienne à 360 px.
export const DURATIONS: [Exclude<ShelfFilters['duration'], 'all'>, string][] = [['court', '< 30'], ['moyen', '30–60'], ['long', '60–90'], ['tres', '90+']];
// Complexité : clés i18n par valeur de filtre (valeur SQL jamais traduite).
const POIDS: Record<Exclude<ShelfFilters['weight'], 'all'>, CléDict> = {
  leger: 'etagere.poidsLeger', moyen: 'etagere.poidsMoyen', lourd: 'etagere.poidsLourd',
};

const NEUTRAL: ShelfFilters = { q: '', players: null, weight: 'all', duration: 'all', format: 'all' };

// Recherche + filtres partagés (étagère, ludothèque). Par défaut, repliés en une
// rangée : la liste est le héros. Le badge compte les familles de filtres actives.
export default function ShelfControls({ filters, setFilters, visible, total, withFormat = false, countHint, suggestJoueurs }: {
  filters: ShelfFilters;
  setFilters: (f: ShelfFilters) => void;
  visible: number;
  total: number;
  /** Familles Boîte : pour la ludothèque (l'étagère groupe déjà ses blocs par format). */
  withFormat?: boolean;
  /** Complément du compteur ; absent → « disponibles pour la partie », chaîne vide → rien. */
  countHint?: string;
  /** v4.12.0 — étagère : nombre de joueurs de la partie, proposé en un tap (jamais appliqué d'office). */
  suggestJoueurs?: number;
}) {
  const { lang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const hint = countHint === undefined ? t('etagere.disponiblesCeSoir') : countHint;
  const activeCount = filtresActifs(filters);
  return (
    <div className="collection-controls">
      <div className="controls-row">
        <input className="shelf-search" type="search" placeholder={t('etagere.recherche')}
               aria-label={t('etagere.rechercheAria')} value={filters.q}
               onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <button type="button" className="fbtn" aria-expanded={open}
                onClick={() => setOpen((o) => !o)}>
          {t('etagere.filtres')} {activeCount > 0 && <span className="badge">{activeCount}</span>}
        </button>
      </div>
      {open && (
        <div className="fam-row">
          <div className="fam" role="group" aria-label={t('etagere.filtreJoueurs')}>
            <span className="fam-k">{t('etagere.joueurs')}</span>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button key={n} type="button" className={`fchip ${filters.players === n ? 'on' : ''}`}
                      onClick={() => setFilters({ ...filters, players: filters.players === n ? null : n })}>{n}</button>
            ))}
          </div>
          <div className="fam" role="group" aria-label={t('etagere.filtreComplexite')}>
            <span className="fam-k">{t('etagere.complexite')}</span>
            {WEIGHTS.map((v) => (
              <button key={v} type="button" className={`fchip ${filters.weight === v ? 'on' : ''}`}
                      onClick={() => setFilters({ ...filters, weight: filters.weight === v ? 'all' : v })}>{t(POIDS[v])}</button>
            ))}
          </div>
          <div className="fam" role="group" aria-label={t('etagere.filtreDuree')}>
            <span className="fam-k">{t('etagere.dureeMin')}</span>
            {DURATIONS.map(([v, label]) => (
              <button key={v} type="button" className={`fchip ${filters.duration === v ? 'on' : ''}`}
                      onClick={() => setFilters({ ...filters, duration: filters.duration === v ? 'all' : v })}>{label}</button>
            ))}
          </div>
          {withFormat && (
            <div className="fam" role="group" aria-label={t('etagere.filtreFormat')}>
              <span className="fam-k">{t('etagere.boite')}</span>
              {FORMATS.map((f) => (
                <button key={f} type="button" className={`fchip ${filters.format === f ? 'on' : ''}`}
                        onClick={() => setFilters({ ...filters, format: filters.format === f ? 'all' : f })}>{formatShort(f, lang)}</button>
              ))}
            </div>
          )}
          {suggestJoueurs != null && suggestJoueurs > 0 && filters.players !== suggestJoueurs && (
            <p className="suggest-joueurs">
              {t('etagere.vousEtes', { n: suggestJoueurs })} ·{' '}
              <button type="button" className="link-btn" onClick={() => setFilters({ ...filters, players: suggestJoueurs })}>
                {t('etagere.filtrerSurN', { n: suggestJoueurs })}
              </button>
            </p>
          )}
          <p className="shelf-count" role="status">
            {t('etagere.nbSur', { v: visible, total })}{hint ? ` ${hint}` : ''}
            {activeCount > 0 && (
              <button type="button" className="link-btn" onClick={() => setFilters({ ...NEUTRAL })}>{t('etagere.toutAfficher')}</button>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
