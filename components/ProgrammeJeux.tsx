'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from './LanguageProvider';

// v4.15.0 — « ＋ Ajouter un jeu » au programme (organisateur) : bottom-sheet de sa ludothèque,
// une case par jeu ; cocher / décocher ajoute / retire tout de suite.
export default function ProgrammeJeux({ evtId, ludo, programme }: {
  evtId: number; ludo: { id: number; title: string }[]; programme: number[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [coches, setCoches] = useState<Set<number>>(() => new Set(programme));

  async function basculer(gameId: number) {
    const actif = !coches.has(gameId);
    setCoches((s) => { const n = new Set(s); if (actif) n.add(gameId); else n.delete(gameId); return n; });
    await fetch(`/api/evenements/${evtId}/jeux`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gameId, actif }),
    });
    router.refresh();
  }

  return (
    <>
      <button type="button" className="link-btn" onClick={() => setOpen(true)}>{t('evt.ajouterJeu')}</button>
      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <div className="bottom-sheet" role="dialog" aria-modal="true" aria-label={t('evt.programmeTitre')} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="sheet-close" aria-label={t('etagere.fermer')} onClick={() => setOpen(false)}>✕</button>
            <h2>{t('evt.programmeTitre')}</h2>
            <ul className="player-list">
              {ludo.map((g) => (
                <li key={g.id}><label>
                  <input type="checkbox" checked={coches.has(g.id)} onChange={() => basculer(g.id)} /> <span>{g.title}</span>
                </label></li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
