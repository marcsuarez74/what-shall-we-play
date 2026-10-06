'use client';
import { useState } from 'react';
import type { UserLite } from '@/lib/types';
import NightPicker, { type CerclePicker } from './NightPicker';
import { useI18n } from './LanguageProvider';

// « ＋ Programmer une partie » → bottom-sheet avec NightPicker (date + heure + joueurs).
export default function NightPlanner({ users, meId, cercles }: { users: UserLite[]; meId: number; cercles: CerclePicker[] }) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  return (
    <>
      <button type="button" className="btn-copper" onClick={() => setOpen(true)}>
        {t('soiree.programmerBtn')}
      </button>
      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <NightPicker users={users} prechecked={[meId]} meId={meId} cercles={cercles} withDate onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
