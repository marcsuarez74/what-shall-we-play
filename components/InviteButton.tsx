'use client';
import { buildInviteMessage, shareMessage } from '@/lib/announce';

// Invitation : message composé par l'app, envoi via partage natif sinon wa.me.
export default function InviteButton({ dateLong, time, pseudos }: {
  dateLong: string;
  time: string | null;
  pseudos: string[];
}) {
  return (
    <button type="button" className="btn-ghost invite-btn"
            onClick={() => shareMessage(buildInviteMessage({ dateLong, time, pseudos }))}>
      💬 Inviter sur WhatsApp
    </button>
  );
}
