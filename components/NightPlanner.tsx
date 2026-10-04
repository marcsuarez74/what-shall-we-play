'use client';
import { useState } from 'react';
import type { UserLite } from '@/lib/types';
import NightPicker from './NightPicker';
import { useI18n } from './LanguageProvider';

// « ＋ Programmer une partie » → bottom-sheet avec NightPicker (date + heure + joueurs).
export default function NightPlanner({ users, meId }: { users: UserLite[]; meId: number }) {
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
            <NightPicker users={users} prechecked={[meId]} withDate onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
