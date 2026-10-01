// app/api/me/events/route.ts — flux SSE « quelque chose de neuf pour toi ».
// Ajout à une partie, jeu posé ou retiré : le client rafraîchit sa page au lieu
// de regarder un écran périmé. Battement de cœur 30 s, reconnexion automatique
// côté EventSource, X-Accel-Buffering: no pour traverser nginx.
// Terminaisons CRLF obligatoires : certains parseurs EventSource (Chromium)
// ignorent les blocs terminés par un simple LF — le flux semble ouvert mais
// aucun événement n'est jamais délivré.
import { getSessionUser } from '@/lib/session';
import { subscribeUser } from '@/lib/events';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response('Non connecté', { status: 401 });

  const encoder = new TextEncoder();
  const BLOC = '\r\n\r\n'; // fin de bloc SSE, comprise par tous les navigateurs
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (bloc: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(bloc + BLOC)); } catch { closed = true; }
      };
      send(': ouvert'); // flush des en-têtes côté proxys
      unsubscribe = subscribeUser(user.id, () => send('event: change'));
      heartbeat = setInterval(() => send(': battement'), 30_000);
      req.signal.addEventListener('abort', () => {
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe?.();
        try { controller.close(); } catch { /* déjà fermé */ }
      });
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}
