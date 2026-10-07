'use client';
import { useState } from 'react';
import type { UserLite } from '@/lib/types';
import NightPicker, { type CerclePicker, type Quand } from './NightPicker';
import { useI18n } from './LanguageProvider';

// « ＋ Nouvelle partie » → bottom-sheet avec NightPicker (v4.10.0 : « Une date » présélectionné).
// v4.15.0 : depuis un événement, « ▶ Démarrer une partie » (Maintenant, événement prérempli).
export default function NightPlanner({ users, meId, cercles, evenements = [], evenementId = null, quand = 'une', label }: {
  users: UserLite[]; meId: number; cercles: CerclePicker[];
  evenements?: { id: number; titre: string }[]; evenementId?: number | null; quand?: Quand; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  return (
    <>
      <button type="button" className="btn-copper" onClick={() => setOpen(true)}>
        {label ?? t('soiree.programmerBtn')}
      </button>
      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <NightPicker users={users} prechecked={[meId]} meId={meId} cercles={cercles} quand={quand}
                         evenements={evenements} evenementId={evenementId} onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
