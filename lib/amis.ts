// v4.8.0 — amitiés : un lien réciproque entre deux comptes (une ligne par paire,
// user_a < user_b). C'est la base de ce qu'on voit et de qui on peut inviter :
// les relations = mes amis + mon foyer. Les invités par lien n'y entrent jamais.
import crypto from 'node:crypto';
import { getDb } from './db';
import { emitToUsers } from './events';
import { t, type Lang } from './i18n';
import type { UserLite } from './types';
import { notifier } from './push';

type Res = { ok: true } | { error: string; status: number };
const paire = (x: number, y: number): [number, number] => (x < y ? [x, y] : [y, x]);

function estCompte(id: number): boolean {
  return !!getDb().prepare('SELECT 1 FROM users WHERE id = ? AND est_invite = 0').get(id);
}

export function etatAmitie(moi: number, autre: number): 'ami' | 'demande_envoyee' | 'demande_recue' | null {
  const [a, b] = paire(moi, autre);
  const r = getDb().prepare('SELECT etat, demandeur FROM amities WHERE user_a = ? AND user_b = ?').get(a, b) as
    { etat: string; demandeur: number } | undefined;
  if (!r) return null;
  if (r.etat === 'ami') return 'ami';
  return r.demandeur === moi ? 'demande_envoyee' : 'demande_recue';
}

function devenirAmis(x: number, y: number, demandeur: number): void {
  const [a, b] = paire(x, y);
  getDb().prepare(`INSERT INTO amities (user_a, user_b, etat, demandeur) VALUES (?, ?, 'ami', ?)
    ON CONFLICT (user_a, user_b) DO UPDATE SET etat = 'ami'`).run(a, b, demandeur);
  emitToUsers([x, y]);
}

// Demande par pseudo. Si l'autre m'avait déjà demandé, on devient amis directement.
export function demanderAmi(moi: number, pseudo: unknown, lang: Lang = 'fr'): Res & { etat?: 'ami' | 'demande' } {
  const p = typeof pseudo === 'string' ? pseudo.trim() : '';
  const cible = getDb().prepare('SELECT id FROM users WHERE pseudo = ? AND est_invite = 0').get(p) as { id: number } | undefined;
  if (!cible) return { error: t(lang, 'amis.errPseudoInconnu'), status: 404 };
  if (cible.id === moi) return { error: t(lang, 'amis.errSoiMeme'), status: 400 };
  const etat = etatAmitie(moi, cible.id);
  if (etat === 'ami') return { error: t(lang, 'amis.errDejaAmis'), status: 409 };
  if (etat === 'demande_envoyee') return { error: t(lang, 'amis.errDejaDemande'), status: 409 };
  if (etat === 'demande_recue') { devenirAmis(moi, cible.id, cible.id); return { ok: true, etat: 'ami' }; }
  const [a, b] = paire(moi, cible.id);
  getDb().prepare("INSERT INTO amities (user_a, user_b, etat, demandeur) VALUES (?, ?, 'demande', ?)").run(a, b, moi);
  emitToUsers([cible.id]);
  const qui = (getDb().prepare('SELECT pseudo FROM users WHERE id = ?').get(moi) as { pseudo: string }).pseudo;
  void notifier([cible.id], 'amis', (lang) => ({ titre: t(lang, 'notif.demandeAmi', { p: qui }), url: '/amis', tag: `ami-${moi}` }));
  return { ok: true, etat: 'demande' };
}

export function repondreDemande(moi: number, autre: number, accepter: boolean, lang: Lang = 'fr'): Res {
  if (etatAmitie(moi, autre) !== 'demande_recue') return { error: t(lang, 'amis.errPasDeDemande'), status: 404 };
  const [a, b] = paire(moi, autre);
  if (accepter) devenirAmis(moi, autre, autre);
  else getDb().prepare('DELETE FROM amities WHERE user_a = ? AND user_b = ?').run(a, b);
  return { ok: true };
}

// Retirer un ami (ou annuler une demande envoyée) : geste explicite, confirmé côté UI.
export function retirerAmi(moi: number, autre: number): Res {
  const [a, b] = paire(moi, autre);
  getDb().prepare('DELETE FROM amities WHERE user_a = ? AND user_b = ?').run(a, b);
  emitToUsers([moi, autre]);
  return { ok: true };
}

// Mon lien d'ami : créé à la première demande, stable ensuite.
export function lienAmi(moi: number): string {
  const db = getDb();
  const r = db.prepare('SELECT lien_ami FROM users WHERE id = ?').get(moi) as { lien_ami: string | null };
  if (r.lien_ami) return r.lien_ami;
  const token = crypto.randomBytes(16).toString('hex');
  db.prepare('UPDATE users SET lien_ami = ? WHERE id = ?').run(token, moi);
  return token;
}
export function proprietaireLienAmi(token: unknown): { id: number; pseudo: string; sticker: string | null; avatar_path: string | null } | null {
  if (typeof token !== 'string' || token.length < 16) return null;
  return (getDb().prepare('SELECT id, pseudo, sticker, avatar_path FROM users WHERE lien_ami = ? AND est_invite = 0').get(token) as
    { id: number; pseudo: string; sticker: string | null; avatar_path: string | null } | undefined) ?? null;
}
// Ouvrir le lien d'ami de quelqu'un : amis tout de suite (partager son lien vaut accord).
export function rejoindreParLienAmi(moi: number, token: unknown, lang: Lang = 'fr'): Res & { amiId?: number } {
  const ami = proprietaireLienAmi(token);
  if (!ami) return { error: t(lang, 'amis.errLienInvalide'), status: 404 };
  if (ami.id === moi) return { error: t(lang, 'amis.errSoiMeme'), status: 400 };
  if (!estCompte(moi)) return { error: t(lang, 'erreurs.impossible'), status: 403 };
  devenirAmis(moi, ami.id, moi);
  return { ok: true, amiId: ami.id };
}

const COLS = 'u.id, u.pseudo, u.sticker, u.avatar_path';
export function listAmis(moi: number): UserLite[] {
  return getDb().prepare(`
    SELECT ${COLS} FROM amities a JOIN users u ON u.id = CASE WHEN a.user_a = ? THEN a.user_b ELSE a.user_a END
    WHERE (a.user_a = ? OR a.user_b = ?) AND a.etat = 'ami' ORDER BY u.pseudo COLLATE NOCASE`).all(moi, moi, moi) as UserLite[];
}
export function listDemandesRecues(moi: number): UserLite[] {
  return getDb().prepare(`
    SELECT ${COLS} FROM amities a JOIN users u ON u.id = a.demandeur
    WHERE (a.user_a = ? OR a.user_b = ?) AND a.etat = 'demande' AND a.demandeur != ?
    ORDER BY a.created_at`).all(moi, moi, moi) as UserLite[];
}
export function listDemandesEnvoyees(moi: number): UserLite[] {
  return getDb().prepare(`
    SELECT ${COLS} FROM amities a JOIN users u ON u.id = CASE WHEN a.user_a = ? THEN a.user_b ELSE a.user_a END
    WHERE (a.user_a = ? OR a.user_b = ?) AND a.etat = 'demande' AND a.demandeur = ?`).all(moi, moi, moi, moi) as UserLite[];
}

// Les personnes que je vois et que je peux inscrire : mes amis + mon foyer (sans moi,
// sans invités). Remplace l'ancienne liste de tous les comptes.
export function listRelations(moi: number): UserLite[] {
  return getDb().prepare(`
    SELECT ${COLS} FROM users u
    WHERE u.est_invite = 0 AND u.id != ? AND (
      u.id IN (SELECT CASE WHEN user_a = ? THEN user_b ELSE user_a END FROM amities
               WHERE (user_a = ? OR user_b = ?) AND etat = 'ami')
      OR (u.foyer_id IS NOT NULL AND u.foyer_id = (SELECT foyer_id FROM users WHERE id = ?)))
    ORDER BY u.pseudo COLLATE NOCASE`).all(moi, moi, moi, moi, moi) as UserLite[];
}

// Liens partagés (lien d'ami, lien de cercle) : absolus, comme le lien d'invitation d'une partie.
export const urlPublique = (chemin: string) => `${process.env.PUBLIC_URL || 'https://what-shall-we-play.marco-studio.fr'}${chemin}`;
