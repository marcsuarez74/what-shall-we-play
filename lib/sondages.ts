// v4.10.0 — sondage de dates : l'organisateur propose 2 à 6 soirs à ses amis et cercles,
// chacun coche ceux où il est dispo, puis l'organisateur retient un ou plusieurs soirs.
// Chaque soir retenu devient une partie programmée : dispo → joueurs, « non » → Pas dispo,
// sans réponse → invitation en attente. Le sondage est alors fermé.
import { getDb } from './db';
import { emitToUsers } from './events';
import { createNight, validerPlanning, normaliserTitre } from './nights';
import { filtrerJoueurs, inviter } from './invitations';
import { notifier } from './push';
import { t, type Lang } from './i18n';
import { formatDate, titrePartie } from './i18n/format';
import type { UserLite } from './types';

type Res = { ok: true } | { error: string; status: number };
export const DATES_MIN = 2;
export const DATES_MAX = 6;

export type DateSondage = { id: number; played_at: string; start_time: string | null; dispos: UserLite[] };
export type Sondage = {
  id: number; creator_id: number; titre: string | null; hote: UserLite;
  dates: DateSondage[]; invites: (UserLite & { repondu: boolean })[];
};

const pseudoDe = (id: number) => (getDb().prepare('SELECT pseudo FROM users WHERE id = ?').get(id) as { pseudo: string }).pseudo;
const dateCourte = (lang: Lang, d: { played_at: string; start_time: string | null }) =>
  formatDate(lang, `${d.played_at}T${d.start_time ?? '12:00'}`, d.start_time
    ? { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
    : { weekday: 'short', day: 'numeric', month: 'short' });

export function creerSondage(moi: number, entree: { titre?: unknown; dates?: unknown; playerIds?: unknown; via?: Map<number, number> }, lang: Lang = 'fr'):
  Res & { id?: number } {
  const titre = normaliserTitre(entree.titre);
  if (titre === false) return { error: t(lang, 'soiree.errTitre'), status: 400 };
  const brutes = Array.isArray(entree.dates) ? entree.dates as { playedAt?: unknown; startTime?: unknown }[] : [];
  if (brutes.length < DATES_MIN || brutes.length > DATES_MAX) return { error: t(lang, 'sondage.errNbDates'), status: 400 };
  const dates: { played_at: string; start_time: string | null }[] = [];
  for (const d of brutes) {
    const start = d?.startTime === '' || d?.startTime == null ? null : d.startTime;
    const err = d?.playedAt == null ? t(lang, 'soiree.errDateInvalide') : validerPlanning(d.playedAt, start, lang);
    if (err) return { error: err, status: 400 };
    const cle = { played_at: d.playedAt as string, start_time: start as string | null };
    if (dates.some((x) => x.played_at === cle.played_at && x.start_time === cle.start_time)) return { error: t(lang, 'sondage.errDoublon'), status: 400 };
    dates.push(cle);
  }
  dates.sort((a, b) => `${a.played_at}${a.start_time ?? ''}`.localeCompare(`${b.played_at}${b.start_time ?? ''}`));
  const invites = filtrerJoueurs(moi, Array.isArray(entree.playerIds) ? entree.playerIds : []).filter((id) => id !== moi);
  if (invites.length === 0) return { error: t(lang, 'sondage.errPersonne'), status: 400 };
  const db = getDb();
  const id = db.transaction(() => {
    const sid = Number(db.prepare('INSERT INTO sondages (creator_id, titre) VALUES (?, ?)').run(moi, titre ?? null).lastInsertRowid);
    const insD = db.prepare('INSERT INTO sondage_dates (sondage_id, played_at, start_time) VALUES (?, ?, ?)');
    for (const d of dates) insD.run(sid, d.played_at, d.start_time);
    const insI = db.prepare('INSERT INTO sondage_invites (sondage_id, user_id, via_cercle) VALUES (?, ?, ?)');
    for (const u of invites) insI.run(sid, u, entree.via?.get(u) ?? null);
    return sid;
  })();
  emitToUsers(invites);
  const hote = pseudoDe(moi);
  void notifier(invites, 'invitations', (l) => ({
    titre: t(l, 'notif.sondage', { p: hote }),
    corps: t(l, 'notif.sondageCorps', { titre: titre ?? t(l, 'sondage.sansTitre'), n: dates.length }),
    url: '/nights', tag: `sondage-${id}`,
  }));
  return { ok: true, id };
}

function estInvite(sondageId: number, userId: number): boolean {
  return !!getDb().prepare('SELECT 1 FROM sondage_invites WHERE sondage_id = ? AND user_id = ?').get(sondageId, userId);
}
function participants(sondageId: number): number[] {
  const s = getDb().prepare('SELECT creator_id FROM sondages WHERE id = ?').get(sondageId) as { creator_id: number } | undefined;
  if (!s) return [];
  return [s.creator_id, ...(getDb().prepare('SELECT user_id FROM sondage_invites WHERE sondage_id = ?').all(sondageId) as { user_id: number }[]).map((r) => r.user_id)];
}

// Cocher / décocher une date. La première réponse crée une ligne pour chaque date (« non »).
export function repondreSondage(sondageId: number, moi: number, dateId: unknown, dispo: unknown, lang: Lang = 'fr'): Res {
  if (typeof dispo !== 'boolean' || !Number.isInteger(dateId)) return { error: t(lang, 'erreurs.requeteInvalide'), status: 400 };
  const db = getDb();
  const date = db.prepare('SELECT id FROM sondage_dates WHERE id = ? AND sondage_id = ?').get(dateId, sondageId);
  if (!date || !estInvite(sondageId, moi)) return { error: t(lang, 'sondage.errIntrouvable'), status: 404 };
  db.transaction(() => {
    db.prepare(`INSERT OR IGNORE INTO sondage_reponses (date_id, user_id, dispo)
      SELECT id, ?, 0 FROM sondage_dates WHERE sondage_id = ?`).run(moi, sondageId);
    db.prepare('UPDATE sondage_reponses SET dispo = ? WHERE date_id = ? AND user_id = ?').run(dispo ? 1 : 0, dateId, moi);
  })();
  emitToUsers(participants(sondageId));
  return { ok: true };
}

function lire(sondageId: number): Sondage | null {
  const db = getDb();
  const s = db.prepare(`SELECT s.id, s.creator_id, s.titre, u.pseudo, u.sticker, u.avatar_path FROM sondages s
    JOIN users u ON u.id = s.creator_id WHERE s.id = ?`).get(sondageId) as
    { id: number; creator_id: number; titre: string | null; pseudo: string; sticker: string | null; avatar_path: string | null } | undefined;
  if (!s) return null;
  const hote: UserLite = { id: s.creator_id, pseudo: s.pseudo, sticker: s.sticker, avatar_path: s.avatar_path };
  const dates = (db.prepare('SELECT id, played_at, start_time FROM sondage_dates WHERE sondage_id = ? ORDER BY played_at, start_time')
    .all(sondageId) as Omit<DateSondage, 'dispos'>[]).map((d) => ({
    ...d,
    dispos: [hote, ...db.prepare(`SELECT u.id, u.pseudo, u.sticker, u.avatar_path FROM sondage_reponses r JOIN users u ON u.id = r.user_id
      WHERE r.date_id = ? AND r.dispo = 1 ORDER BY u.pseudo COLLATE NOCASE`).all(d.id) as UserLite[]],
  }));
  const invites = (db.prepare(`SELECT u.id, u.pseudo, u.sticker, u.avatar_path,
      EXISTS (SELECT 1 FROM sondage_reponses r JOIN sondage_dates d ON d.id = r.date_id WHERE d.sondage_id = i.sondage_id AND r.user_id = u.id) AS repondu
    FROM sondage_invites i JOIN users u ON u.id = i.user_id WHERE i.sondage_id = ? ORDER BY u.pseudo COLLATE NOCASE`)
    .all(sondageId) as (UserLite & { repondu: number })[]).map((u) => ({ ...u, repondu: !!u.repondu }));
  return { id: s.id, creator_id: s.creator_id, titre: s.titre, hote, dates, invites };
}

export function sondagesInvite(moi: number): (Sondage & { mesDispos: number[]; via_nom: string | null })[] {
  const rows = getDb().prepare(`SELECT i.sondage_id, c.nom AS via_nom FROM sondage_invites i LEFT JOIN cercles c ON c.id = i.via_cercle
    WHERE i.user_id = ? ORDER BY i.sondage_id`).all(moi) as { sondage_id: number; via_nom: string | null }[];
  return rows.map((r) => {
    const s = lire(r.sondage_id)!;
    return { ...s, via_nom: r.via_nom, mesDispos: s.dates.filter((d) => d.dispos.some((u) => u.id === moi)).map((d) => d.id) };
  });
}
export function sondagesOrganises(moi: number): Sondage[] {
  return (getDb().prepare('SELECT id FROM sondages WHERE creator_id = ? ORDER BY id').all(moi) as { id: number }[]).map((r) => lire(r.id)!);
}
export function nbSondagesSansReponse(moi: number): number {
  return (getDb().prepare(`SELECT COUNT(*) AS n FROM sondage_invites i WHERE i.user_id = ? AND NOT EXISTS (
    SELECT 1 FROM sondage_reponses r JOIN sondage_dates d ON d.id = r.date_id WHERE d.sondage_id = i.sondage_id AND r.user_id = ?)`)
    .get(moi, moi) as { n: number }).n;
}

// Retenir un ou plusieurs soirs : une partie programmée par soir, puis le sondage est fermé.
export function retenirDates(sondageId: number, moi: number, dateIds: unknown, lang: Lang = 'fr'): Res & { nightIds?: number[] } {
  const s = lire(sondageId);
  if (!s) return { error: t(lang, 'sondage.errIntrouvable'), status: 404 };
  if (s.creator_id !== moi) return { error: t(lang, 'soiree.errSeulCreateur'), status: 403 };
  const ids = Array.isArray(dateIds) ? dateIds.map(Number) : [];
  const retenues = s.dates.filter((d) => ids.includes(d.id));
  if (retenues.length === 0) return { error: t(lang, 'sondage.errAucuneDate'), status: 400 };
  for (const d of retenues) { const err = validerPlanning(d.played_at, d.start_time, lang); if (err) return { error: err, status: 400 }; }
  const db = getDb();
  const via = new Map((db.prepare('SELECT user_id, via_cercle FROM sondage_invites WHERE sondage_id = ? AND via_cercle IS NOT NULL')
    .all(sondageId) as { user_id: number; via_cercle: number }[]).map((r) => [r.user_id, r.via_cercle]));
  const hote = pseudoDe(moi);
  const nightIds: number[] = [];
  for (const d of retenues) {
    const dispos = d.dispos.map((u) => u.id).filter((id) => id !== moi);
    const nightId = createNight(moi, [moi, ...dispos], { playedAt: d.played_at, startTime: d.start_time, titre: s.titre });
    const insI = db.prepare('INSERT OR IGNORE INTO night_invites (night_id, user_id, etat, via_cercle) VALUES (?, ?, ?, ?)');
    const nonDispo = s.invites.filter((u) => u.repondu && !dispos.includes(u.id)).map((u) => u.id);
    for (const id of dispos) insI.run(nightId, id, 'dispo', via.get(id) ?? null);
    for (const id of nonDispo) insI.run(nightId, id, 'absent', via.get(id) ?? null);
    inviter(nightId, moi, s.invites.filter((u) => !u.repondu).map((u) => u.id), via); // sans réponse : invitation classique (notifiée)
    void notifier(dispos, 'invitations', (l) => ({
      titre: t(l, 'notif.retenu', { p: hote, date: dateCourte(l, d) }),
      corps: titrePartie(l, { titre: s.titre, played_at: d.played_at }), url: '/nights', tag: `invitation-${nightId}`,
    }));
    nightIds.push(nightId);
  }
  const concernes = participants(sondageId);
  db.prepare('DELETE FROM sondages WHERE id = ?').run(sondageId);
  emitToUsers(concernes);
  return { ok: true, nightIds };
}

// Supprimer un sondage (organisateur, confirmé côté UI) : aucune partie n'est touchée.
export function supprimerSondage(sondageId: number, moi: number, lang: Lang = 'fr'): Res {
  const s = getDb().prepare('SELECT creator_id FROM sondages WHERE id = ?').get(sondageId) as { creator_id: number } | undefined;
  if (!s) return { error: t(lang, 'sondage.errIntrouvable'), status: 404 };
  if (s.creator_id !== moi) return { error: t(lang, 'soiree.errSeulCreateur'), status: 403 };
  const concernes = participants(sondageId);
  getDb().prepare('DELETE FROM sondages WHERE id = ?').run(sondageId);
  emitToUsers(concernes);
  return { ok: true };
}
