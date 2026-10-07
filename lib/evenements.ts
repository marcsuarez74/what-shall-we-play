// v4.15.0 — événements (marathon, week-end de salon…) : une vue au-dessus des parties.
// Les participants VOIENT l'événement ; personne n'est invité aux parties par lui. Chaque
// joueur rattache SA partie au démarrage (« Nouvelle partie » ou « Modifier la partie »),
// avec les seuls joueurs de cette partie. Supprimer détache les parties, jamais ne les efface.
import { getDb } from './db';
import { emitToUsers } from './events';
import { filtrerJoueurs } from './invitations';
import { getNight, getNightPlayers } from './nights';
import { listUserLibrary } from './games';
import { notifier } from './push';
import { t, type Lang } from './i18n';
import type { Night, UserLite } from './types';

type Erreur = { error: string; status: number };
export const TITRE_EVT_MAX = 40;
export const DESCRIPTION_MAX = 200;

export type EntreeEvenement = { titre: unknown; description: unknown; du: unknown; au: unknown };
export type Evenement = {
  id: number; creator_id: number; titre: string; description: string | null; du: string | null; au: string | null;
  hote_pseudo: string; participants: UserLite[];
};
export type CarteEvenement = { id: number; titre: string; du: string | null; au: string | null; nb_participants: number; nb_parties: number; nb_jeux: number; nb_joues: number; creator_id: number };

const dateValide = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
  && new Date(`${d}T12:00:00`).toLocaleDateString('sv-SE') === d;

function valider(e: EntreeEvenement, lang: Lang): { titre: string; description: string | null; du: string | null; au: string | null } | Erreur {
  const titre = typeof e.titre === 'string' ? e.titre.trim().replace(/\s+/g, ' ') : '';
  if (!titre || titre.length > TITRE_EVT_MAX) return { error: t(lang, 'evt.errTitre', { max: TITRE_EVT_MAX }), status: 400 };
  const description = typeof e.description === 'string' && e.description.trim() ? e.description.trim() : null;
  if (description && description.length > DESCRIPTION_MAX) return { error: t(lang, 'evt.errDescription', { max: DESCRIPTION_MAX }), status: 400 };
  const du = e.du == null || e.du === '' ? null : e.du;
  const au = e.au == null || e.au === '' ? null : e.au;
  // Période facultative, mais complète et ordonnée quand elle est donnée.
  if ((du === null) !== (au === null) || (du !== null && (!dateValide(du) || !dateValide(au) || (au as string) < du)))
    return { error: t(lang, 'evt.errPeriode'), status: 400 };
  return { titre, description, du: du as string | null, au: au as string | null };
}

export function estParticipant(evtId: number, moi: number): boolean {
  return !!getDb().prepare(`
    SELECT 1 FROM evenements e WHERE e.id = ? AND (e.creator_id = ?
      OR EXISTS (SELECT 1 FROM evenement_membres m WHERE m.evenement_id = e.id AND m.user_id = ?))`).get(evtId, moi, moi);
}

// Créer : les participants sont choisis parmi mes relations (amis, foyer, cercles) ;
// chacun est prévenu une fois (notification « Invitations »).
export function creerEvenement(moi: number, e: EntreeEvenement, ids: unknown[], lang: Lang = 'fr'): number | Erreur {
  const v = valider(e, lang);
  if ('error' in v) return v;
  const db = getDb();
  const eid = Number(db.prepare('INSERT INTO evenements (creator_id, titre, description, du, au) VALUES (?, ?, ?, ?, ?)')
    .run(moi, v.titre, v.description, v.du, v.au).lastInsertRowid);
  const membres = filtrerJoueurs(moi, ids).filter((id) => id !== moi);
  const ins = db.prepare('INSERT OR IGNORE INTO evenement_membres (evenement_id, user_id) VALUES (?, ?)');
  for (const id of membres) ins.run(eid, id);
  emitToUsers(membres);
  const hote = (db.prepare('SELECT pseudo FROM users WHERE id = ?').get(moi) as { pseudo: string }).pseudo;
  void notifier(membres, 'invitations', (l) => ({
    titre: t(l, 'notif.evenement', { p: hote }), corps: v.titre, url: `/evenements/${eid}`, tag: `evenement-${eid}`,
  }));
  return eid;
}

export function mesEvenements(moi: number): CarteEvenement[] {
  return getDb().prepare(`
    SELECT e.id, e.titre, e.du, e.au, e.creator_id,
      1 + (SELECT COUNT(*) FROM evenement_membres m WHERE m.evenement_id = e.id) AS nb_participants,
      (SELECT COUNT(*) FROM nights n WHERE n.evenement_id = e.id) AS nb_parties,
      (SELECT COUNT(*) FROM evenement_jeux j WHERE j.evenement_id = e.id) AS nb_jeux,
      (SELECT COUNT(*) FROM evenement_jeux j WHERE j.evenement_id = e.id AND EXISTS (
        SELECT 1 FROM nights n WHERE n.evenement_id = e.id AND n.status = 'termine' AND n.game_id = j.game_id)) AS nb_joues
    FROM evenements e
    WHERE e.creator_id = ? OR EXISTS (SELECT 1 FROM evenement_membres m WHERE m.evenement_id = e.id AND m.user_id = ?)
    ORDER BY COALESCE(e.du, '9999'), e.id DESC`).all(moi, moi) as CarteEvenement[];
}

// Le détail, pour un participant seulement (sinon null : on ne révèle rien).
export function getEvenement(evtId: number, moi: number): Evenement | null {
  if (!estParticipant(evtId, moi)) return null;
  const db = getDb();
  const e = db.prepare(`SELECT e.*, u.pseudo AS hote_pseudo FROM evenements e JOIN users u ON u.id = e.creator_id WHERE e.id = ?`)
    .get(evtId) as Omit<Evenement, 'participants'>;
  const participants = db.prepare(`
    SELECT u.id, u.pseudo, u.sticker, u.avatar_path FROM users u
    WHERE u.id = ? OR u.id IN (SELECT user_id FROM evenement_membres WHERE evenement_id = ?)
    ORDER BY u.id = ? DESC, u.pseudo COLLATE NOCASE`).all(e.creator_id, evtId, e.creator_id) as UserLite[];
  return { ...e, participants };
}

const ouOrganisateur = (evtId: number, moi: number, lang: Lang): Erreur | null => {
  const e = getDb().prepare('SELECT creator_id FROM evenements WHERE id = ?').get(evtId) as { creator_id: number } | undefined;
  if (!e || !estParticipant(evtId, moi)) return { error: t(lang, 'evt.errIntrouvable'), status: 404 };
  if (e.creator_id !== moi) return { error: t(lang, 'soiree.errSeulCreateur'), status: 403 };
  return null;
};

// « Au programme » : un jeu de MA ludothèque (organisateur). Retirer = même geste.
export function ajouterJeuProgramme(evtId: number, moi: number, gameId: number, lang: Lang = 'fr'): { ok: true } | Erreur {
  const err = ouOrganisateur(evtId, moi, lang);
  if (err) return err;
  if (!listUserLibrary(moi).some((g) => g.id === gameId)) return { error: t(lang, 'soiree.errJeuPasDansLudo'), status: 403 };
  getDb().prepare('INSERT OR IGNORE INTO evenement_jeux (evenement_id, game_id) VALUES (?, ?)').run(evtId, gameId);
  return { ok: true };
}
export function retirerJeuProgramme(evtId: number, moi: number, gameId: number, lang: Lang = 'fr'): { ok: true } | Erreur {
  const err = ouOrganisateur(evtId, moi, lang);
  if (err) return err;
  getDb().prepare('DELETE FROM evenement_jeux WHERE evenement_id = ? AND game_id = ?').run(evtId, gameId);
  return { ok: true };
}

export type JeuProgramme = { game_id: number; title: string; joue: boolean };
export function jeuxProgramme(evtId: number): JeuProgramme[] {
  return (getDb().prepare(`
    SELECT j.game_id, g.title, EXISTS (SELECT 1 FROM nights n WHERE n.evenement_id = j.evenement_id
      AND n.status = 'termine' AND n.game_id = j.game_id) AS joue
    FROM evenement_jeux j JOIN games g ON g.id = j.game_id
    WHERE j.evenement_id = ? ORDER BY g.title COLLATE NOCASE`).all(evtId) as { game_id: number; title: string; joue: number }[])
    .map((j) => ({ ...j, joue: j.joue === 1 }));
}

export function partiesEvenement(evtId: number): (Night & { joueurs: UserLite[]; game_title: string | null })[] {
  const nights = getDb().prepare(`
    SELECT n.*, g.title AS game_title FROM nights n LEFT JOIN games g ON g.id = n.game_id
    WHERE n.evenement_id = ? ORDER BY n.played_at, n.start_time, n.id`).all(evtId) as (Night & { game_title: string | null })[];
  return nights.map((n) => ({ ...n, joueurs: getNightPlayers(n.id) }));
}

// Rattacher (ou détacher, evtId = null) MA partie à un événement dont je suis participant.
export function rattacher(nightId: number, moi: number, evtId: number | null, lang: Lang = 'fr'): { ok: true } | Erreur {
  const night = getNight(nightId);
  if (!night) return { error: t(lang, 'erreurs.soireeIntrouvable'), status: 404 };
  if (night.creator_id !== moi) return { error: t(lang, 'soiree.errSeulCreateur'), status: 403 };
  if (evtId !== null && !estParticipant(evtId, moi)) return { error: t(lang, 'evt.errIntrouvable'), status: 404 };
  getDb().prepare('UPDATE nights SET evenement_id = ? WHERE id = ?').run(evtId, nightId);
  return { ok: true };
}

// Supprimer (organisateur) : les parties restent, détachées ; programme et participants partent.
export function supprimerEvenement(evtId: number, moi: number, lang: Lang = 'fr'): { ok: true } | Erreur {
  const err = ouOrganisateur(evtId, moi, lang);
  if (err) return err;
  const db = getDb();
  const membres = (db.prepare('SELECT user_id FROM evenement_membres WHERE evenement_id = ?').all(evtId) as { user_id: number }[]).map((m) => m.user_id);
  db.transaction(() => {
    db.prepare('UPDATE nights SET evenement_id = NULL WHERE evenement_id = ?').run(evtId);
    db.prepare('DELETE FROM evenements WHERE id = ?').run(evtId);
  })();
  emitToUsers(membres);
  return { ok: true };
}
