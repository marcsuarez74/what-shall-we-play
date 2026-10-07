// v4.8.0 — cercles : des listes d'amis pour inviter en un geste. Une personne peut
// être dans plusieurs cercles ; être dans le même cercle ne rend pas amis.
// Adhésion « libre » (le lien suffit, tout membre ajoute) ou « validation » (les
// arrivées attendent un admin). Plusieurs admins possibles ; le cercle garde
// toujours au moins un admin tant qu'il a des membres.
import crypto from 'node:crypto';
import { getDb } from './db';
import { emitToUsers } from './events';
import { listRelations } from './amis';
import { t, type Lang } from './i18n';
import type { UserLite } from './types';
import { notifier } from './push';

type Res = { ok: true } | { error: string; status: number };
export type Adhesion = 'libre' | 'validation';
export interface Cercle { id: number; nom: string; lien_token: string; adhesion: Adhesion; created_by: number | null; created_at: string }
export type MembreCercle = UserLite & { role: 'admin' | 'membre'; etat: 'membre' | 'attente'; ajoute_par: number | null };

const NOM_MAX = 40;
function nomValide(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  return s && s.length <= NOM_MAX ? s : null;
}
export function getCercle(id: number): Cercle | null {
  return (getDb().prepare('SELECT * FROM cercles WHERE id = ?').get(id) as Cercle | undefined) ?? null;
}
function ligne(cercleId: number, userId: number) {
  return getDb().prepare('SELECT role, etat FROM cercle_membres WHERE cercle_id = ? AND user_id = ?').get(cercleId, userId) as
    { role: 'admin' | 'membre'; etat: 'membre' | 'attente' } | undefined;
}
const estMembre = (c: number, u: number) => ligne(c, u)?.etat === 'membre';
const estAdmin = (c: number, u: number) => { const l = ligne(c, u); return l?.etat === 'membre' && l.role === 'admin'; };
// v4.9.0 : une arrivée en attente prévient les admins ; un ajout direct prévient la personne ajoutée.
function notifierArrivee(c: Cercle, userId: number, etat: 'membre' | 'attente') {
  const pseudo = (getDb().prepare('SELECT pseudo FROM users WHERE id = ?').get(userId) as { pseudo: string }).pseudo;
  const url = `/amis/cercles/${c.id}`;
  if (etat === 'attente') {
    const admins = (getDb().prepare("SELECT user_id FROM cercle_membres WHERE cercle_id = ? AND role = 'admin' AND etat = 'membre'").all(c.id) as { user_id: number }[]).map((r) => r.user_id);
    void notifier(admins, 'amis', (lang) => ({ titre: t(lang, 'notif.adhesion', { p: pseudo, nom: c.nom }), url, tag: `adhesion-${c.id}-${userId}` }));
  } else {
    void notifier([userId], 'amis', (lang) => ({ titre: t(lang, 'notif.ajouteCercle', { nom: c.nom }), url, tag: `cercle-${c.id}` }));
  }
}
function prevenir(cercleId: number) {
  emitToUsers((getDb().prepare('SELECT user_id FROM cercle_membres WHERE cercle_id = ?').all(cercleId) as { user_id: number }[]).map((r) => r.user_id));
}

export function creerCercle(moi: number, nom: unknown, lang: Lang = 'fr'): Res & { id?: number } {
  const n = nomValide(nom);
  if (!n) return { error: t(lang, 'cercles.errNom'), status: 400 };
  const db = getDb();
  const id = db.transaction(() => {
    const info = db.prepare('INSERT INTO cercles (nom, lien_token, created_by) VALUES (?, ?, ?)')
      .run(n, crypto.randomBytes(16).toString('hex'), moi);
    const cid = Number(info.lastInsertRowid);
    db.prepare("INSERT INTO cercle_membres (cercle_id, user_id, role, etat, ajoute_par) VALUES (?, ?, 'admin', 'membre', ?)").run(cid, moi, moi);
    return cid;
  })();
  return { ok: true, id };
}

export function mesCercles(moi: number): (Cercle & { nb: number; role: 'admin' | 'membre'; apercu: string[] })[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT c.*, m.role, (SELECT COUNT(*) FROM cercle_membres x WHERE x.cercle_id = c.id AND x.etat = 'membre') AS nb
    FROM cercles c JOIN cercle_membres m ON m.cercle_id = c.id AND m.user_id = ? AND m.etat = 'membre'
    ORDER BY c.nom COLLATE NOCASE`).all(moi) as (Cercle & { nb: number; role: 'admin' | 'membre' })[];
  return rows.map((r) => ({
    ...r,
    apercu: (db.prepare(`SELECT COALESCE(u.sticker, '🎲') AS s FROM cercle_membres m JOIN users u ON u.id = m.user_id
      WHERE m.cercle_id = ? AND m.etat = 'membre' AND m.user_id != ? LIMIT 4`).all(r.id, moi) as { s: string }[]).map((x) => x.s),
  }));
}

export function membresCercle(cercleId: number): MembreCercle[] {
  return getDb().prepare(`
    SELECT u.id, u.pseudo, u.sticker, u.avatar_path, m.role, m.etat, m.ajoute_par
    FROM cercle_membres m JOIN users u ON u.id = m.user_id WHERE m.cercle_id = ?
    ORDER BY m.etat DESC, CASE m.role WHEN 'admin' THEN 0 ELSE 1 END, u.pseudo COLLATE NOCASE`).all(cercleId) as MembreCercle[];
}

// Voir un cercle : ses membres (et ceux en attente, pour le savoir).
export function peutVoir(cercleId: number, moi: number): boolean {
  return !!ligne(cercleId, moi);
}

// Ajouter un ami au cercle. Admin → membre ; simple membre : seulement si l'adhésion
// est libre (membre) ou sur validation (en attente d'un admin).
export function ajouterMembre(cercleId: number, acteur: number, userId: number, lang: Lang = 'fr'): Res & { etat?: 'membre' | 'attente' } {
  const c = getCercle(cercleId);
  if (!c || !estMembre(cercleId, acteur)) return { error: t(lang, 'cercles.errIntrouvable'), status: 404 };
  if (!listRelations(acteur).some((u) => u.id === userId)) return { error: t(lang, 'cercles.errPasAmi'), status: 403 };
  if (ligne(cercleId, userId)) return { error: t(lang, 'cercles.errDejaMembre'), status: 409 };
  const etat = estAdmin(cercleId, acteur) || c.adhesion === 'libre' ? 'membre' : 'attente';
  getDb().prepare("INSERT INTO cercle_membres (cercle_id, user_id, role, etat, ajoute_par) VALUES (?, ?, 'membre', ?, ?)").run(cercleId, userId, etat, acteur);
  prevenir(cercleId);
  notifierArrivee(c, userId, etat);
  return { ok: true, etat };
}

// Ouvrir le lien d'un cercle : membre (adhésion libre) ou en attente (validation).
export function cercleParLien(token: unknown): Cercle | null {
  if (typeof token !== 'string' || token.length < 16) return null;
  return (getDb().prepare('SELECT * FROM cercles WHERE lien_token = ?').get(token) as Cercle | undefined) ?? null;
}
export function rejoindreParLien(moi: number, token: unknown, lang: Lang = 'fr'): Res & { id?: number; etat?: 'membre' | 'attente' } {
  const c = cercleParLien(token);
  if (!c) return { error: t(lang, 'cercles.errLienInvalide'), status: 404 };
  if (!getDb().prepare('SELECT 1 FROM users WHERE id = ? AND est_invite = 0').get(moi)) return { error: t(lang, 'erreurs.impossible'), status: 403 };
  const deja = ligne(c.id, moi);
  if (deja) return { ok: true, id: c.id, etat: deja.etat };
  const etat = c.adhesion === 'libre' ? 'membre' : 'attente';
  getDb().prepare("INSERT INTO cercle_membres (cercle_id, user_id, role, etat, ajoute_par) VALUES (?, ?, 'membre', ?, NULL)").run(c.id, moi, etat);
  prevenir(c.id);
  if (etat === 'attente') notifierArrivee(c, moi, etat);
  return { ok: true, id: c.id, etat };
}

export function validerMembre(cercleId: number, admin: number, userId: number, accepter: boolean, lang: Lang = 'fr'): Res {
  if (!estAdmin(cercleId, admin)) return { error: t(lang, 'cercles.errAdmin'), status: 403 };
  if (ligne(cercleId, userId)?.etat !== 'attente') return { error: t(lang, 'cercles.errIntrouvable'), status: 404 };
  if (accepter) getDb().prepare("UPDATE cercle_membres SET etat = 'membre' WHERE cercle_id = ? AND user_id = ?").run(cercleId, userId);
  else getDb().prepare('DELETE FROM cercle_membres WHERE cercle_id = ? AND user_id = ?').run(cercleId, userId);
  prevenir(cercleId);
  return { ok: true };
}

function nbAdmins(cercleId: number): number {
  return (getDb().prepare("SELECT COUNT(*) AS n FROM cercle_membres WHERE cercle_id = ? AND role = 'admin' AND etat = 'membre'").get(cercleId) as { n: number }).n;
}
function nbMembres(cercleId: number): number {
  return (getDb().prepare("SELECT COUNT(*) AS n FROM cercle_membres WHERE cercle_id = ? AND etat = 'membre'").get(cercleId) as { n: number }).n;
}

export function changerRole(cercleId: number, admin: number, userId: number, role: 'admin' | 'membre', lang: Lang = 'fr'): Res {
  if (!estAdmin(cercleId, admin)) return { error: t(lang, 'cercles.errAdmin'), status: 403 };
  if (!estMembre(cercleId, userId)) return { error: t(lang, 'cercles.errIntrouvable'), status: 404 };
  if (role === 'membre' && estAdmin(cercleId, userId) && nbAdmins(cercleId) <= 1) return { error: t(lang, 'cercles.errDernierAdmin'), status: 409 };
  getDb().prepare('UPDATE cercle_membres SET role = ? WHERE cercle_id = ? AND user_id = ?').run(role, cercleId, userId);
  prevenir(cercleId);
  return { ok: true };
}

export function retirerMembre(cercleId: number, admin: number, userId: number, lang: Lang = 'fr'): Res {
  if (!estAdmin(cercleId, admin)) return { error: t(lang, 'cercles.errAdmin'), status: 403 };
  if (userId === admin) return quitterCercle(cercleId, admin, lang);
  if (!ligne(cercleId, userId)) return { error: t(lang, 'cercles.errIntrouvable'), status: 404 };
  if (estAdmin(cercleId, userId) && nbAdmins(cercleId) <= 1) return { error: t(lang, 'cercles.errDernierAdmin'), status: 409 };
  prevenir(cercleId);
  getDb().prepare('DELETE FROM cercle_membres WHERE cercle_id = ? AND user_id = ?').run(cercleId, userId);
  emitToUsers([userId]);
  return { ok: true };
}

// Quitter : le dernier admin d'un cercle qui garde d'autres membres doit d'abord en nommer
// un autre ; le dernier membre emporte le cercle (il n'invite plus personne).
export function quitterCercle(cercleId: number, moi: number, lang: Lang = 'fr'): Res {
  const l = ligne(cercleId, moi);
  if (!l) return { error: t(lang, 'cercles.errIntrouvable'), status: 404 };
  const db = getDb();
  if (l.etat === 'membre' && nbMembres(cercleId) <= 1) {
    db.prepare('DELETE FROM cercles WHERE id = ?').run(cercleId);
    return { ok: true };
  }
  if (l.etat === 'membre' && l.role === 'admin' && nbAdmins(cercleId) <= 1) return { error: t(lang, 'cercles.errNommerAdmin'), status: 409 };
  db.prepare('DELETE FROM cercle_membres WHERE cercle_id = ? AND user_id = ?').run(cercleId, moi);
  prevenir(cercleId);
  return { ok: true };
}

export function modifierCercle(cercleId: number, admin: number, champs: { nom?: unknown; adhesion?: unknown }, lang: Lang = 'fr'): Res {
  if (!estAdmin(cercleId, admin)) return { error: t(lang, 'cercles.errAdmin'), status: 403 };
  const db = getDb();
  if (champs.nom !== undefined) {
    const n = nomValide(champs.nom);
    if (!n) return { error: t(lang, 'cercles.errNom'), status: 400 };
    db.prepare('UPDATE cercles SET nom = ? WHERE id = ?').run(n, cercleId);
  }
  if (champs.adhesion !== undefined) {
    if (champs.adhesion !== 'libre' && champs.adhesion !== 'validation') return { error: t(lang, 'erreurs.requeteInvalide'), status: 400 };
    db.prepare('UPDATE cercles SET adhesion = ? WHERE id = ?').run(champs.adhesion, cercleId);
  }
  prevenir(cercleId);
  return { ok: true };
}

// Supprimer un cercle (admin, confirmé) : ni parties ni comptes ne sont touchés.
export function supprimerCercle(cercleId: number, admin: number, lang: Lang = 'fr'): Res {
  if (!estAdmin(cercleId, admin)) return { error: t(lang, 'cercles.errAdmin'), status: 403 };
  prevenir(cercleId);
  getDb().prepare('DELETE FROM cercles WHERE id = ?').run(cercleId);
  return { ok: true };
}

// Les co-membres de mes cercles (hors attente) : invitables à mes parties programmées.
export function coMembres(moi: number): number[] {
  return (getDb().prepare(`
    SELECT DISTINCT m2.user_id FROM cercle_membres m1 JOIN cercle_membres m2 ON m2.cercle_id = m1.cercle_id
    WHERE m1.user_id = ? AND m1.etat = 'membre' AND m2.etat = 'membre' AND m2.user_id != ?`).all(moi, moi) as { user_id: number }[]).map((r) => r.user_id);
}

// Programmer en invitant des cercles : chaque personne → le premier de mes cercles cochés qui la contient
// (affiché « via le cercle … » sur son invitation).
export function viaCercles(moi: number, cercleIds: unknown): Map<number, number> {
  const via = new Map<number, number>();
  if (!Array.isArray(cercleIds)) return via;
  for (const cid of cercleIds.map(Number)) {
    if (!Number.isInteger(cid) || !estMembre(cid, moi)) continue;
    for (const m of membresCercle(cid)) if (m.etat === 'membre' && m.id !== moi && !via.has(m.id)) via.set(m.id, cid);
  }
  return via;
}
