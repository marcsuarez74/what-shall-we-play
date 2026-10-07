// v4.9.0 — notifications push (Web Push + VAPID). Un abonnement par appareil ; quatre
// types réglables par compte (tous actifs par défaut). L'envoi n'est jamais bloquant :
// une erreur ne fait échouer aucune action, un abonnement expiré (404/410) est oublié.
import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';
import { getDb, DATA_DIR } from './db';
import { t, type Lang } from './i18n';
import { titrePartie } from './i18n/format';

export const TYPES = ['invitations', 'reponses', 'rappel', 'amis'] as const;
export type TypeNotif = (typeof TYPES)[number];
export type Message = { titre: string; corps?: string; url: string; tag?: string };
type Abonnement = { endpoint: string; p256dh: string; auth: string };

// Clés VAPID : l'environnement si fourni, sinon générées une fois et gardées avec la base.
let cles: { publicKey: string; privateKey: string } | null = null;
export function clesVapid(): { publicKey: string; privateKey: string } {
  if (cles) return cles;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    cles = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  } else {
    const fichier = path.join(DATA_DIR, 'vapid.json');
    try { cles = JSON.parse(fs.readFileSync(fichier, 'utf8')); } catch { /* première fois */ }
    if (!cles?.publicKey || !cles.privateKey) {
      cles = webpush.generateVAPIDKeys();
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(fichier, JSON.stringify(cles), { mode: 0o600 });
    }
  }
  return cles;
}

// Point d'envoi remplaçable par les tests (aucun réseau en test unitaire).
export const transport = {
  envoyer: (a: Abonnement, donnees: string): Promise<unknown> => {
    const { publicKey, privateKey } = clesVapid();
    return webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, donnees, {
      TTL: 6 * 3600,
      vapidDetails: { subject: process.env.VAPID_SUBJECT || 'mailto:contact@marco-studio.fr', publicKey, privateKey },
    });
  },
};

export function abonner(userId: number, sub: unknown): boolean {
  const s = sub as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  if (!s || typeof s.endpoint !== 'string' || !/^https:\/\//.test(s.endpoint) || s.endpoint.length > 1000
    || typeof s.keys?.p256dh !== 'string' || typeof s.keys?.auth !== 'string') return false;
  getDb().prepare(`INSERT INTO push_abonnements (endpoint, user_id, p256dh, auth) VALUES (?, ?, ?, ?)
    ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`)
    .run(s.endpoint, userId, s.keys.p256dh, s.keys.auth);
  return true;
}
export function desabonner(userId: number, endpoint: unknown): void {
  getDb().prepare('DELETE FROM push_abonnements WHERE endpoint = ? AND user_id = ?').run(String(endpoint), userId);
}

export function prefsNotif(userId: number): Record<TypeNotif, boolean> {
  const off = ((getDb().prepare('SELECT notif_off FROM users WHERE id = ?').get(userId) as { notif_off: string } | undefined)?.notif_off ?? '').split(',');
  return Object.fromEntries(TYPES.map((ty) => [ty, !off.includes(ty)])) as Record<TypeNotif, boolean>;
}
export function reglerNotif(userId: number, type: unknown, actif: unknown): boolean {
  if (!TYPES.includes(type as TypeNotif) || typeof actif !== 'boolean') return false;
  const prefs = { ...prefsNotif(userId), [type as TypeNotif]: actif };
  getDb().prepare('UPDATE users SET notif_off = ? WHERE id = ?').run(TYPES.filter((ty) => !prefs[ty]).join(','), userId);
  return true;
}

// Prévenir des comptes : message composé dans la langue de chacun. Résout quand tous les
// envois sont tentés (les appelants ne l'attendent pas ; les tests, si).
export function notifier(userIds: number[], type: TypeNotif, message: (lang: Lang) => Message): Promise<void> {
  const db = getDb();
  const envois: Promise<unknown>[] = [];
  for (const id of new Set(userIds)) {
    const u = db.prepare('SELECT lang, notif_off FROM users WHERE id = ? AND est_invite = 0').get(id) as { lang: string; notif_off: string } | undefined;
    if (!u || u.notif_off.split(',').includes(type)) continue;
    const abos = db.prepare('SELECT endpoint, p256dh, auth FROM push_abonnements WHERE user_id = ?').all(id) as Abonnement[];
    if (abos.length === 0) continue;
    const donnees = JSON.stringify(message(u.lang === 'en' ? 'en' : 'fr'));
    for (const a of abos) {
      envois.push(transport.envoyer(a, donnees).catch((e: { statusCode?: number }) => {
        if (e?.statusCode === 404 || e?.statusCode === 410) db.prepare('DELETE FROM push_abonnements WHERE endpoint = ?').run(a.endpoint);
      }));
    }
  }
  return Promise.all(envois).then(() => undefined);
}

// Rappel du jour J : 10 h, ou 2 h avant l'heure prévue si c'est plus tard. Une fois par partie.
export function seuilRappel(startTime: string | null | undefined): string {
  if (!startTime) return '10:00';
  const [h, m] = startTime.split(':').map(Number);
  const avant = `${String(Math.max(0, h - 2)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return avant > '10:00' ? avant : '10:00';
}
export function envoyerRappels(maintenant = new Date()): Promise<void> {
  const db = getDb();
  const jour = maintenant.toLocaleDateString('sv-SE');
  const heure = maintenant.toTimeString().slice(0, 5);
  const nuits = db.prepare("SELECT id, titre, played_at, start_time FROM nights WHERE status = 'creation' AND played_at = ? AND rappel_envoye = 0")
    .all(jour) as { id: number; titre: string | null; played_at: string; start_time: string | null }[];
  const envois: Promise<void>[] = [];
  for (const n of nuits) {
    if (heure < seuilRappel(n.start_time)) continue;
    db.prepare('UPDATE nights SET rappel_envoye = 1 WHERE id = ?').run(n.id);
    const joueurs = (db.prepare('SELECT user_id FROM night_players WHERE night_id = ?').all(n.id) as { user_id: number }[]).map((r) => r.user_id);
    const nbJeux = (db.prepare('SELECT COUNT(*) AS c FROM night_games WHERE night_id = ?').get(n.id) as { c: number }).c;
    envois.push(notifier(joueurs, 'rappel', (lang) => ({
      titre: n.start_time ? t(lang, 'notif.rappelHeure', { h: n.start_time }) : t(lang, 'notif.rappelJour'),
      corps: t(lang, 'notif.rappelCorps', { titre: titrePartie(lang, n), n: joueurs.length, j: nbJeux }),
      url: `/etagere?night=${n.id}`, tag: `rappel-${n.id}`,
    })));
  }
  return Promise.all(envois).then(() => undefined);
}
