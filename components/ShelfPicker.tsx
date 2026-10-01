'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FORMATS, FORMAT_LABEL } from '@/lib/formats';
import { normalizeText } from '@/lib/filters';
import type { Game } from '@/lib/types';
import BoxImage from './BoxImage';

// Sélecteur « Ajouter à la partie » : MA ludothèque (jeux perso + ceux de mon foyer),
// groupée par format, recherche insensible aux accents. Un tap = un ajout/retrait.
export default function ShelfPicker({ nightId, myLibrary, shelfIds, onClose }: {
  nightId: number; myLibrary: Game[]; shelfIds: number[]; onClose: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const added = useMemo(() => new Set(shelfIds), [shelfIds]);

  const byFormat = useMemo(() => {
    const needle = normalizeText(q.trim());
    return FORMATS.map((f) => ({
      f,
      list: myLibrary.filter((g) => g.box_format === f && (!needle || normalizeText(g.title).includes(needle))),
    })).filter(({ list }) => list.length > 0);
  }, [myLibrary, q]);

  async function toggle(g: Game) {
    // Une rangée se désactive elle-même pendant son POST ; les autres restent
    // cliquables (deux taps rapides ne doivent jamais perdre un ajout).
    setBusy(g.id);
    await fetch(`/api/nights/${nightId}/games`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: g.id, added: !added.has(g.id) }),
    });
    setBusy((b) => (b === g.id ? null : b));
    router.refresh();
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="bottom-sheet picker-sheet" role="dialog" aria-modal="true" aria-label="Ajouter à la partie"
           onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h3>Ajouter à la partie</h3>
          <button type="button" className="sheet-close" aria-label="Fermer" onClick={onClose}>✕</button>
        </div>
        <p className="sheet-sub">Depuis votre ludothèque — vos jeux et ceux de votre foyer.</p>
        <div className="search">
          <span aria-hidden="true">🔎</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher dans ma ludothèque…"
                 aria-label="Rechercher dans ma ludothèque" autoComplete="off" />
        </div>
        <div className="pick-list">
          {byFormat.map(({ f, list }) => (
            <div key={f} className="fmt-group">
              <div className="fmt-k">{FORMAT_LABEL[f]}</div>
              {list.map((g) => (
                <div key={g.id} className="pick-row">
                  <span className="cov"><BoxImage game={g} /></span>
                  <span className="pick-meta">
                    <b>{g.title}</b>
                    <span className="who">{g.foyer_id != null ? 'du foyer' : 'perso'}{g.playtime_min ? ` · ${g.playtime_min} min` : ''}</span>
                  </span>
                  <button type="button" className={`add ${added.has(g.id) ? 'on' : ''}`}
                          disabled={busy === g.id}
                          aria-label={added.has(g.id) ? `Retirer ${g.title} de la partie` : `Ajouter ${g.title} à la partie`}
                          onClick={() => toggle(g)}>
                    {added.has(g.id) ? '✓' : '+'}
                  </button>
                </div>
              ))}
            </div>
          ))}
          {byFormat.length === 0 && <p className="pick-empty">Rien de tel dans votre ludothèque.</p>}
        </div>
        <div className="sheet-foot">
          <span className="count">{added.size === 0 ? 'Aucun jeu ajouté' : `${added.size} ${added.size > 1 ? 'jeux ajoutés' : 'jeu ajouté'}`}</span>
          <button type="button" className="btn-copper" onClick={onClose}>Terminé</button>
        </div>
      </div>
    </div>
  );
}
