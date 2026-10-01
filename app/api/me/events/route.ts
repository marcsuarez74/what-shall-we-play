// app/api/me/events/route.ts — flux SSE « quelque chose de neuf pour toi ».
// Un flux HTTP tenu ouvert par utilisateur : ajout à une partie, jeu posé ou
// retiré sur l'étagère… le client rafraîchit sa page au lieu de regarder un
// écran périmé. Reconnexion automatique côté EventSource, battement 30 s.
import { getSessionUser } from '@/lib/session';
import { subscribeUser } from '@/lib/events';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response('Non connecté', { status: 401 });

  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (line: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(line)); } catch { closed = true; }
      };
      send(': ouvert\n\n'); // flush des en-têtes côté proxys
      unsubscribe = subscribeUser(user.id, () => send('event: change\n\n'));
      heartbeat = setInterval(() => send(': battement\n\n'), 30_000);
      req.signal.addEventListener('abort', () => {
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe();
        try { controller.close(); } catch { /* déjà fermé */ }
      });
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // nginx : le flux passe sans buffering
    },
  });
}
