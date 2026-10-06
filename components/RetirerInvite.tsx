'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from './LanguageProvider';

// Geste explicite en deux temps (pattern « Sûr ? » du dépôt) : la suppression
// emporte votes, scores, verdicts et sessions de l'invité (CASCADE comptée).
export default function RetirerInvite({ nightId, inviteId, nom }: { nightId: number; inviteId: number; nom: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [confirme, setConfirme] = useState(false);
  const [busy, setBusy] = useState(false);

  async function retirer() {
    setBusy(true);
    const r = await fetch(`/api/nights/${nightId}/retirer-invite`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inviteId }),
    });
    setBusy(false);
    if (r.ok) router.refresh();
  }

  return (
    <button type="button" aria-label={t('soiree.retirerInviteAria', { nom })}
            className="retirer-invite" disabled={busy}
            onClick={() => (confirme ? retirer() : setConfirme(true))}>
      {confirme ? t('soiree.retirerInviteSur') : '✕'}
    </button>
  );
}
