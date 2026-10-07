'use client';
import { useState } from 'react';
import type { UserLite } from '@/lib/types';
import NightPicker, { type CerclePicker } from './NightPicker';
import { useI18n } from './LanguageProvider';

// « ＋ Nouvelle partie » → bottom-sheet avec NightPicker (v4.10.0 : « Une date » présélectionné).
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
            <NightPicker users={users} prechecked={[meId]} meId={meId} cercles={cercles} quand="une" onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
