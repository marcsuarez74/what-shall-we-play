// v4.9.0 — côté navigateur : état des notifications sur CET appareil, activation, désactivation.
export type EtatPush = 'chargement' | 'indispo' | 'iphone' | 'bloquees' | 'off' | 'on';

const supporte = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const iphoneHorsApp = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
  && !window.matchMedia('(display-mode: standalone)').matches;

async function abonnementCourant(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function etatPush(): Promise<EtatPush> {
  if (!supporte()) return iphoneHorsApp() ? 'iphone' : 'indispo';
  if (Notification.permission === 'denied') return 'bloquees';
  if (Notification.permission !== 'granted') return 'off';
  return (await abonnementCourant()) ? 'on' : 'off';
}

function cleBinaire(base64: string): Uint8Array<ArrayBuffer> {
  const b = atob((base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(b.length));
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

// Demande la permission (geste requis), abonne l'appareil et l'enregistre côté serveur.
export async function activerPush(): Promise<EtatPush> {
  if (!supporte()) return iphoneHorsApp() ? 'iphone' : 'indispo';
  const permission = await Notification.requestPermission();
  if (permission === 'denied') return 'bloquees';
  if (permission !== 'granted') return 'off';
  const { cle } = await (await fetch('/api/push')).json() as { cle: string };
  const reg = await navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready);
  const sub = (await reg.pushManager.getSubscription())
    ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cleBinaire(cle) });
  const r = await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }) });
  if (!r.ok) throw new Error('abonnement refusé');
  return 'on';
}

export async function desactiverPush(): Promise<void> {
  const sub = await abonnementCourant();
  if (!sub) return;
  await fetch('/api/push', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
  await sub.unsubscribe();
}
