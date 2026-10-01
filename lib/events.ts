// Bus d'événements en mémoire pour la sync live (SSE), par UTILISATEUR :
// quand quelque chose change pour une partie (étagère, joueurs), chaque
// participant est prévenu — y compris celui qui regardait l'écran « nouvelle
// partie » et vient d'être ajouté. Turbopack/Next isole les modules par
// bundle de route : le bus vit sur globalThis pour être LE même objet partout.
import { EventEmitter } from 'node:events';

const g = globalThis as typeof globalThis & { __wspBus?: EventEmitter };
const bus = g.__wspBus ?? (g.__wspBus = new EventEmitter());
bus.setMaxListeners(0); // un abonné par onglet connecté

export function emitToUsers(userIds: number[]): void {
  for (const id of new Set(userIds)) bus.emit(`user:${id}`);
}

// Renvoie la fonction de désabonnement.
export function subscribeUser(userId: number, cb: () => void): () => void {
  const ch = `user:${userId}`;
  bus.on(ch, cb);
  return () => bus.off(ch, cb);
}
