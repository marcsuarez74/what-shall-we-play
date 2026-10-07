import { getDb } from './db';
import { emitToUsers } from './events';
import { t, type Lang } from './i18n';
import { creerInvite } from './auth';
import crypto from 'node:crypto';
import type { Game, Night, Pick, UserLite } from './types';

export function getActiveNight(userId: number): Night | null {
  return (getDb().prepare(`
    SELECT n.* FROM nights n
    WHERE n.played_at = date('now','localtime')
      AND n.status != 'termine'
      AND (n.creator_id = ? OR EXISTS (SELECT 1 FROM night_players np WHERE np.night_id = n.id AND np.user_id = ?))
    ORDER BY n.id DESC LIMIT 1`).get(userId, userId) as Night | undefined) ?? null;
}

// Parties à venir (créateur OU participant), la plus proche d'abord.
export function getPlannedNights(userId: number): Night[] {
  return getDb().prepare(`
    SELECT n.* FROM nights n
    WHERE n.played_at > date('now','localtime')
      AND (n.creator_id = ? OR EXISTS (SELECT 1 FROM night_players np WHERE np.night_id = n.id AND np.user_id = ?))
    ORDER BY n.played_at ASC, n.id ASC`).all(userId, userId) as Night[];
}

// Sync live : chaque participant de la partie est prévenu (son /etagere se rafraîchit).
export function notifyNight(nightId: number): void {
  emitToUsers((getDb().prepare('SELECT user_id FROM night_players WHERE night_id = ?')
    .all(nightId) as { user_id: number }[]).map((r) => r.user_id));
}

// Date calendaire RÉELLE (pas seulement le format) : '2026-10-32' est rejeté.
// Heure bornée : '24:99' est rejeté. Sinon la page QG rendrait Invalid Date (500).
// Date d'aujourd'hui ou plus. v4.7.0 : partagée par la création et la modification.
export function validerPlanning(playedAt: unknown, startTime: unknown, lang: Lang = 'fr'): string | null {
  if (playedAt != null) {
    if (typeof playedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(playedAt)) return t(lang, 'soiree.errDateInvalide');
    const d = new Date(`${playedAt}T12:00:00`); // midi : immune aux pièges de minuit
    if (Number.isNaN(d.getTime()) || d.toLocaleDateString('sv-SE') !== playedAt) return t(lang, 'soiree.errDateInvalide');
    if (playedAt < new Date().toLocaleDateString('sv-SE')) return t(lang, 'soiree.errDatePassee');
  }
  if (startTime != null) {
    const m = typeof startTime === 'string' ? /^(\d{2}):(\d{2})$/.exec(startTime) : null;
    if (!m || Number(m[1]) >= 24 || Number(m[2]) >= 60) return t(lang, 'soiree.errHeureInvalide');
  }
  return null;
}

// v4.7.0 — titre facultatif : espaces réduits, vide → null (repli sur la date à
// l'affichage), 40 caractères au plus. undefined = « pas fourni ».
export const TITRE_MAX = 40;
export function normaliserTitre(v: unknown): string | null | undefined | false {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== 'string') return false;
  const s = v.trim().replace(/\s+/g, ' ');
  if (s.length > TITRE_MAX) return false;
  return s || null;
}

export function createNight(creatorId: number, playerIds: number[], opts?: { playedAt?: string; startTime?: string | null; titre?: string | null }): number {
  const info = getDb()
    .prepare("INSERT INTO nights (creator_id, played_at, start_time, lien_token, titre) VALUES (?, COALESCE(?, date('now','localtime')), ?, ?, ?)")
    .run(creatorId, opts?.playedAt ?? null, opts?.startTime ?? null, crypto.randomBytes(16).toString('hex'), opts?.titre ?? null);
  const nightId = Number(info.lastInsertRowid);
  setNightPlayers(nightId, playerIds.includes(creatorId) ? playerIds : [...playerIds, creatorId]);
  return nightId;
}
export function getNight(nightId: number): Night | null {
  return (getDb().prepare('SELECT * FROM nights WHERE id = ?').get(nightId) as Night | undefined) ?? null;
}
// v4.7.0 — une partie programmée (date à venir) : étagère ouverte, tirage fermé.
export function estFuture(night: { played_at: string }): boolean {
  return (getDb().prepare("SELECT ? > date('now','localtime') AS f").get(night.played_at) as { f: number }).f === 1;
}
// v4.7.0 — l'étagère d'une partie précise (?night=) : une partie non terminée
// dont on est joueur ou créateur. Sinon null (la page retombe sur « ce soir »).
export function getShelfNight(userId: number, nightId: number): Night | null {
  const night = getNight(nightId);
  return night && night.status !== 'termine' && userCanAccessNight(userId, nightId) ? night : null;
}
// Lien d'invitation absolu (partage WhatsApp, copie) d'une partie.
export function lienInvitation(night: { id: number; lien_token?: string | null }): string | undefined {
  if (!night.lien_token) return undefined;
  return `${process.env.PUBLIC_URL || 'https://what-shall-we-play.marco-studio.fr'}/nights/${night.id}/rejoindre?k=${night.lien_token}`;
}
// v4.7.0 — la soirée d'un invité : il n'en a qu'une (celle de son lien).
export function getInviteNight(userId: number): Night | null {
  return (getDb().prepare(`
    SELECT n.* FROM nights n JOIN night_players np ON np.night_id = n.id
    WHERE np.user_id = ? ORDER BY n.id DESC LIMIT 1`).get(userId) as Night | undefined) ?? null;
}
// v4.7.0 — titre, date, heure d'une partie non terminée : créateur seulement.
export function modifierInfosNuit(nightId: number, userId: number, infos: { titre?: string | null; playedAt?: string; startTime?: string | null }, lang: Lang = 'fr'): { ok: true } | { error: string; status: number } {
  const night = getNight(nightId);
  if (!night) return { error: t(lang, 'erreurs.soireeIntrouvable'), status: 404 };
  if (night.creator_id !== userId) return { error: t(lang, 'soiree.errSeulCreateur'), status: 403 };
  if (night.status !== 'creation') return { error: t(lang, 'soiree.errPartieTerminee'), status: 409 };
  const db = getDb();
  if (infos.titre !== undefined) db.prepare('UPDATE nights SET titre = ? WHERE id = ?').run(infos.titre, nightId);
  if (infos.playedAt !== undefined) db.prepare('UPDATE nights SET played_at = ? WHERE id = ?').run(infos.playedAt, nightId);
  if (infos.startTime !== undefined) db.prepare('UPDATE nights SET start_time = ? WHERE id = ?').run(infos.startTime, nightId);
  notifyNight(nightId);
  return { ok: true };
}
export function setNightPlayers(nightId: number, playerIds: number[]): void {
  const db = getDb();
  // v3.0.0 : la validation de sélection de ceux qui restent ne saute pas —
  // seul un joueur qui ARRIVE n'est pas validé (et devra se déclarer prêt).
  const avant = db.prepare('SELECT user_id, validated_at FROM night_players WHERE night_id = ?')
    .all(nightId) as { user_id: number; validated_at: string | null }[];
  db.prepare('DELETE FROM night_players WHERE night_id = ?').run(nightId);
  const ins = db.prepare('INSERT OR IGNORE INTO night_players (night_id, user_id, validated_at) VALUES (?, ?, ?)');
  for (const id of new Set(playerIds)) {
    ins.run(nightId, id, avant.find((r) => r.user_id === id)?.validated_at ?? null);
  }
  // v3.5 — un joueur retiré de la soirée emporte ses votes (idiome « pas de vote fantôme »)
  getDb().prepare(`DELETE FROM game_votes WHERE night_id = ? AND user_id NOT IN (SELECT user_id FROM night_players WHERE night_id = ?)`).run(nightId, nightId);
  notifyNight(nightId); // les joueurs — y compris le nouvel arrivé — voient la partie
}

// v4.6.0 (invités par lien) : jointure par lien de soirée. Un compte sessionné
// rejoint avec son compte (jamais d'invité fantôme) ; sinon le nom crée un invité.
export function rejoindreParLien(
  nightId: number, token: unknown, nom: unknown, sessionUser: { id: number } | null, lang: Lang = 'fr',
): { ok: true; mode: 'compte' | 'invite'; inviteId?: number } | { ok: false; error: string; status: number } {
  const night = getNight(nightId);
  if (!night || night.status === 'termine' || typeof token !== 'string' || token.length < 16 || night.lien_token !== token)
    return { ok: false, error: t(lang, 'soiree.lienInvalide'), status: 403 }; // le lien d'une archive ne rouvre pas la partie
  const joueurs = getNightPlayers(nightId);
  if (sessionUser) {
    if (joueurs.some((j) => j.id === sessionUser.id)) return { ok: true, mode: 'compte' };
    setNightPlayers(nightId, [...joueurs.map((j) => j.id), sessionUser.id]);
    return { ok: true, mode: 'compte' };
  }
  const invite = creerInvite(nom, night.creator_id, lang);
  if ('error' in invite) return { ok: false, error: invite.error, status: invite.status };
  setNightPlayers(nightId, [...joueurs.map((j) => j.id), invite.id]);
  return { ok: true, mode: 'invite', inviteId: invite.id };
}

// v4.6.0 : retrait d'un invité — geste explicite du créateur de la soirée ou de
// l'hôte qui l'a nommé. Transaction : ses picks (ses actions) disparaissent, les
// jeux qu'il avait posés sur l'étagère passent sous le créateur (contenu de la
// soirée conservé), la ligne users disparaît et les FK CASCADE emportent
// players/votes/scores/verdicts/sessions/jetons (idiome « pas de vote fantôme »).
export function retirerInvite(nightId: number, inviteId: number, userId: number, lang: Lang = 'fr'): { ok: true } | { ok: false; error: string; status: number } {
  const db = getDb();
  const night = getNight(nightId);
  const inv = db.prepare('SELECT id, host_id, est_invite FROM users WHERE id = ?').get(inviteId) as { id: number; host_id: number | null; est_invite: number } | undefined;
  if (!night || !inv || !inv.est_invite) return { ok: false, error: t(lang, 'soiree.lienInvalide'), status: 404 };
  // v4.7.0 : l'invité peut aussi se retirer lui-même (« Se retirer de la soirée »)
  const autorise = inv.host_id === userId || night.creator_id === userId || inviteId === userId;
  if (!autorise) return { ok: false, error: t(lang, 'erreurs.impossible'), status: 403 };
  const dansLaSoiree = db.prepare('SELECT 1 FROM night_players WHERE night_id = ? AND user_id = ?').get(nightId, inviteId);
  if (!dansLaSoiree) return { ok: false, error: t(lang, 'soiree.lienInvalide'), status: 404 };
  db.transaction(() => {
    // l'étagère de la soirée n'est pas la propriété de l'invité : le créateur l'adopte
    db.prepare('UPDATE night_games SET added_by = ? WHERE night_id = ? AND added_by = ?').run(night.creator_id, nightId, inviteId);
    // ses tirages (picks) sont ses actions : ils partent avec lui
    db.prepare('DELETE FROM picks WHERE spinner_id = ?').run(inviteId);
    db.prepare('DELETE FROM users WHERE id = ?').run(inviteId);
  })();
  notifyNight(nightId);
  return { ok: true };
}
export function getNightPlayers(nightId: number): UserLite[] {
  return getDb().prepare(`
    SELECT u.id, u.pseudo, u.sticker, u.avatar_path, u.est_invite, np.validated_at FROM night_players np JOIN users u ON u.id = np.user_id
    WHERE np.night_id = ? ORDER BY u.pseudo`).all(nightId) as UserLite[];
}

// v3.0.0 — « chacun dit quand il est prêt » : valider sa sélection n'est pas un
// verrou, c'est un signal. L'ajout ou le retrait d'une boîte par le joueur
// l'annule (la sélection a changé) ; il re-valide quand il veut.
// lang : langue du cookie, passée par la route — défaut 'fr' (tests unitaires).
export function validateSelection(nightId: number, userId: number, lang: Lang = 'fr'): void {
  if (!isNightParticipant(nightId, userId)) throw new Error(t(lang, 'soiree.errPasDansPartie'));
  getDb().prepare(`UPDATE night_players SET validated_at = datetime('now','localtime') WHERE night_id = ? AND user_id = ?`)
    .run(nightId, userId);
  notifyNight(nightId); // « Léa a validé sa sélection » apparaît chez tous, en direct
}
export function userCanAccessNight(userId: number, nightId: number): boolean {
  return !!getDb().prepare(`
    SELECT 1 FROM nights n WHERE n.id = ? AND
      (n.creator_id = ? OR EXISTS (SELECT 1 FROM night_players np WHERE np.night_id = n.id AND np.user_id = ?))`)
    .get(nightId, userId, userId);
}
export function getMyNights(userId: number): Night[] {
  return getDb().prepare(`
    SELECT n.* FROM nights n
    WHERE n.creator_id = ?
       OR EXISTS (SELECT 1 FROM night_players np WHERE np.night_id = n.id AND np.user_id = ?)
    ORDER BY n.played_at DESC, n.id DESC`)
    .all(userId, userId) as Night[];
}
export type NightStateError = { error: string; status: number };

// La boîte sort : LE vrai début de la partie. N'importe quel joueur de la soirée
// peut la sortir (c'est physique : celui qui va chercher la boîte). Le jeu est
// alors verrouillé — plus de relance, plus d'ajout/retrait sur l'étagère.
export function boxOutNight(nightId: number, userId: number, gameId: number, lang: Lang = 'fr'): { ok: true } | NightStateError {
  const night = getNight(nightId);
  if (!night) return { error: t(lang, 'erreurs.soireeIntrouvable'), status: 404 };
  if (!userCanAccessNight(userId, nightId)) return { error: t(lang, 'soiree.errSeulsJoueursBoite'), status: 403 };
  if (night.status === 'en_jeu') return { error: t(lang, 'soiree.errBoiteDejaSortie'), status: 409 };
  if (night.status === 'termine') return { error: t(lang, 'soiree.errPartieTerminee'), status: 409 };
  if (estFuture(night)) return { error: t(lang, 'soiree.errPasAujourdhui'), status: 409 };
  if (!getShelfGames(nightId).some((g) => g.id === gameId)) return { error: t(lang, 'soiree.errJeuPasSurEtagere'), status: 400 };
  getDb().prepare(`UPDATE nights SET game_id = ?, status = 'en_jeu' WHERE id = ?`).run(gameId, nightId);
  notifyNight(nightId);
  return { ok: true };
}

// Le tirage n'existe qu'avant la sortie de boîte.
export function drawAllowed(nightId: number, lang: Lang = 'fr'): { ok: true } | NightStateError {
  const night = getNight(nightId);
  if (!night) return { error: t(lang, 'erreurs.soireeIntrouvable'), status: 404 };
  if (night.status === 'en_jeu') return { error: t(lang, 'soiree.errBoiteVerrouille'), status: 409 };
  if (night.status === 'termine') return { error: t(lang, 'soiree.errPartieTerminee'), status: 409 };
  if (estFuture(night)) return { error: t(lang, 'soiree.errPasAujourdhui'), status: 409 }; // v4.7.0 : tirage le jour J
  return { ok: true };
}

// Terminer : créateur seulement. Scores optionnels { [userId]: nombre } — un seul
// appel atomique (insertion + état) : rien ne se semi-enregistre. Depuis
// creation = abandon (sans scores). Double end refusé.
export function endNight(nightId: number, userId: number, scores?: Record<string, number>, lang: Lang = 'fr'): { ok: true } | NightStateError {
  const night = getNight(nightId);
  if (!night) return { error: t(lang, 'erreurs.soireeIntrouvable'), status: 404 };
  if (night.creator_id !== userId) return { error: t(lang, 'soiree.errSeulCreateur'), status: 403 };
  if (night.status === 'termine') return { error: t(lang, 'soiree.errDejaTerminee'), status: 409 };
  const db = getDb();
  const joueurs = new Set((db.prepare('SELECT user_id FROM night_players WHERE night_id = ?').all(nightId) as { user_id: number }[]).map((r) => r.user_id));
  const lignes: [number, number][] = [];
  if (scores) {
    for (const [k, v] of Object.entries(scores)) {
      const uid = Number(k);
      if (!joueurs.has(uid) || !Number.isFinite(v)) return { error: t(lang, 'soiree.errScoreInvalide'), status: 400 };
      lignes.push([uid, v]);
    }
  }
  db.transaction(() => {
    const ins = db.prepare('INSERT OR REPLACE INTO night_scores (night_id, user_id, score) VALUES (?, ?, ?)');
    for (const [uid, v] of lignes) ins.run(nightId, uid, v);
    db.prepare(`UPDATE nights SET status = 'termine', ended_at = datetime('now','localtime') WHERE id = ?`).run(nightId);
  })();
  notifyNight(nightId);
  return { ok: true };
}

// Date ISO réelle (format + calendaire) et passée ou aujourd'hui — même rigueur
// que validIsoDate de POST /api/nights : '2026-02-31' est rejeté, pas seulement
// le mauvais format. Partagée par corrigerNuit et creerNuitRetro.
function datePasseeValide(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00`); // midi : immune aux pièges de minuit
  return !Number.isNaN(d.getTime()) && d.toLocaleDateString('sv-SE') === s && s <= new Date().toLocaleDateString('sv-SE');
}

// v4.2.0 — corriger une partie terminée : date, jeu, participants, scores.
// Droits : créateur OU participant (choix client). Le changement de jeu
// réinitialise les verdicts de la nuit — l'UI alerte et confirme avant d'envoyer.
// Le retrait d'un participant emporte ses scores et ses votes (pas de fantôme).
// Un score à null (champ vidé dans l'UI) supprime la ligne du participant présent ;
// un nombre la met à jour. creerNuitRetro, lui, reste nombres seuls.
export type NuitPatch = { playedAt?: string; gameId?: number; playerIds?: number[]; scores?: Record<string, number | null> };
export function corrigerNuit(nightId: number, userId: number, patch: NuitPatch, lang: Lang = 'fr'): { ok: true } | NightStateError {
  const night = getNight(nightId);
  if (!night) return { error: t(lang, 'erreurs.soireeIntrouvable'), status: 404 };
  if (!userCanAccessNight(userId, nightId)) return { error: t(lang, 'erreurs.soireeIntrouvable'), status: 404 };
  if (night.status !== 'termine') return { error: t(lang, 'soiree.errCorrigerNonTerminee'), status: 409 };
  const db = getDb();
  if (patch.playedAt !== undefined && !datePasseeValide(patch.playedAt))
    return { error: t(lang, 'soiree.errDateInvalide'), status: 400 }; // clé existante (Planifier) réutilisée
  let jeuChange = false;
  if (patch.gameId !== undefined) {
    if (!db.prepare('SELECT 1 FROM games WHERE id = ?').get(patch.gameId)) return { error: t(lang, 'soiree.errJeuIntrouvable'), status: 400 };
    jeuChange = patch.gameId !== night.game_id;
  }
  if (patch.playerIds !== undefined) {
    if (!patch.playerIds.includes(userId)) return { error: t(lang, 'soiree.errDoitEtreDansSoiree'), status: 400 };
    for (const pid of patch.playerIds)
      if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(pid)) return { error: t(lang, 'soiree.errJoueurIntrouvable'), status: 400 };
  }
  const joueursFinaux = new Set(patch.playerIds ?? (db.prepare('SELECT user_id FROM night_players WHERE night_id = ?').all(nightId) as { user_id: number }[]).map((r) => r.user_id));
  if (patch.scores) {
    for (const [k, v] of Object.entries(patch.scores))
      // null = champ vidé = suppression ; un nombre sinon — tout le reste est un 400
      if (!joueursFinaux.has(Number(k)) || (v !== null && !Number.isFinite(v))) return { error: t(lang, 'soiree.errScoreInvalide'), status: 400 };
  }
  db.transaction(() => {
    if (patch.playedAt !== undefined) db.prepare('UPDATE nights SET played_at = ? WHERE id = ?').run(patch.playedAt, nightId);
    if (patch.gameId !== undefined) {
      db.prepare('UPDATE nights SET game_id = ? WHERE id = ?').run(patch.gameId, nightId);
      if (jeuChange) db.prepare('DELETE FROM night_verdicts WHERE night_id = ?').run(nightId); // l'UI a confirmé avant d'envoyer
    }
    if (patch.playerIds !== undefined) {
      const avant = (db.prepare('SELECT user_id FROM night_players WHERE night_id = ?').all(nightId) as { user_id: number }[]).map((r) => r.user_id);
      db.prepare('DELETE FROM night_players WHERE night_id = ?').run(nightId);
      const ins = db.prepare('INSERT OR IGNORE INTO night_players (night_id, user_id) VALUES (?, ?)');
      for (const id of new Set(patch.playerIds)) ins.run(nightId, id);
      for (const id of avant) if (!patch.playerIds.includes(id))
        db.prepare('DELETE FROM night_scores WHERE night_id = ? AND user_id = ?').run(nightId, id);
      db.prepare('DELETE FROM game_votes WHERE night_id = ? AND user_id NOT IN (SELECT user_id FROM night_players WHERE night_id = ?)').run(nightId, nightId);
    }
    if (patch.scores) {
      const ins = db.prepare('INSERT OR REPLACE INTO night_scores (night_id, user_id, score) VALUES (?, ?, ?)');
      const del = db.prepare('DELETE FROM night_scores WHERE night_id = ? AND user_id = ?');
      for (const [k, v] of Object.entries(patch.scores)) {
        if (v === null) del.run(nightId, Number(k)); // champ vidé → score supprimé (suppression explicite)
        else ins.run(nightId, Number(k), Number(v));
      }
    }
  })();
  notifyNight(nightId); // idiome existant (pas de canal SSE nouveau) — les vues RSC se rafraîchissent
  return { ok: true };
}

// v4.2.0 — supprimer une partie : créateur OU participant (choix client). Les tables
// liées partent en CASCADE (joueurs, jeux d'étagère, scores, picks, verdicts) —
// l'UI a demandé confirmation en listant ce qui disparaît (garde-fou AGENTS.md).
export function supprimerNuit(nightId: number, userId: number, lang: Lang = 'fr'): { ok: true } | NightStateError {
  const night = getNight(nightId);
  if (!night) return { error: t(lang, 'erreurs.soireeIntrouvable'), status: 404 };
  if (!userCanAccessNight(userId, nightId)) return { error: t(lang, 'erreurs.soireeIntrouvable'), status: 404 };
  // v4.7.0 : une partie à venir ou en cours ne se supprime que par son créateur
  if (night.status !== 'termine' && night.creator_id !== userId) return { error: t(lang, 'soiree.errSeulCreateur'), status: 403 };
  const db = getDb();
  const joueurs = getNightPlayers(nightId).map((p) => p.id);
  db.transaction(() => {
    // v4.7.0 : ses invités n'existent que pour elle — ils partent avec (CASCADE
    // sur leurs votes, scores, sessions) ; leurs tirages d'abord (cf. retirerInvite).
    const invites = db.prepare('SELECT u.id FROM users u JOIN night_players np ON np.user_id = u.id WHERE np.night_id = ? AND u.est_invite = 1').all(nightId) as { id: number }[];
    for (const { id } of invites) db.prepare('DELETE FROM picks WHERE spinner_id = ?').run(id);
    db.prepare('DELETE FROM nights WHERE id = ?').run(nightId);
    for (const { id } of invites) db.prepare('DELETE FROM users WHERE id = ?').run(id);
  })();
  // La partie disparaît en direct chez les AUTRES joueurs. Pas chez celui qui supprime :
  // il navigue lui-même, et un refresh live concurrent annulait sa redirection (course
  // push/refresh, cf. db32a9c — E2E « supprimer → redirection » instable en CI).
  emitToUsers(joueurs.filter((id) => id !== userId));
  return { ok: true };
}

// v4.2.0 — créer une partie passée en un geste : date passée + jeu + participants
// + scores optionnels, créée directement terminée avec le jeu posé. L'auteur en
// devient le créateur (auto-ajouté). Pour une partie à venir : le flux Planifier.
export function creerNuitRetro(userId: number, entree: { playedAt: string; gameId: number; playerIds: number[]; scores?: Record<string, number> }, lang: Lang = 'fr'): { ok: true; nightId: number } | NightStateError {
  const db = getDb();
  if (!datePasseeValide(entree.playedAt)) // helper posé en Task 1 — même validation
    return { error: t(lang, 'soiree.errDateInvalide'), status: 400 };
  if (!db.prepare('SELECT 1 FROM games WHERE id = ?').get(entree.gameId)) return { error: t(lang, 'soiree.errJeuIntrouvable'), status: 400 };
  const joueurs = [...new Set(entree.playerIds.includes(userId) ? entree.playerIds : [...entree.playerIds, userId])];
  for (const pid of joueurs)
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(pid)) return { error: t(lang, 'soiree.errJoueurIntrouvable'), status: 400 };
  const lignes: [number, number][] = [];
  if (entree.scores) {
    for (const [k, v] of Object.entries(entree.scores)) {
      const uid = Number(k);
      if (!joueurs.includes(uid) || !Number.isFinite(v)) return { error: t(lang, 'soiree.errScoreInvalide'), status: 400 };
      lignes.push([uid, v]);
    }
  }
  const nightId = db.transaction(() => {
    const info = db.prepare(`INSERT INTO nights (creator_id, played_at, game_id, status, ended_at) VALUES (?, ?, ?, 'termine', datetime('now','localtime'))`)
      .run(userId, entree.playedAt, entree.gameId);
    const id = Number(info.lastInsertRowid);
    const insP = db.prepare('INSERT OR IGNORE INTO night_players (night_id, user_id) VALUES (?, ?)');
    for (const pid of joueurs) insP.run(id, pid);
    const insS = db.prepare('INSERT OR REPLACE INTO night_scores (night_id, user_id, score) VALUES (?, ?, ?)');
    for (const [uid, v] of lignes) insS.run(id, uid, v);
    return id;
  })();
  return { ok: true, nightId }; // pas de notifyNight : une partie du passé n'a personne en live
}

// LA boîte de la partie (une seule, jamais la liste des relances).
export function getNightGame(nightId: number): Game | null {
  const night = getNight(nightId);
  if (!night?.game_id) return null;
  return (getDb().prepare('SELECT * FROM games WHERE id = ?').get(night.game_id) as Game | undefined) ?? null;
}
export type NightScoreRow = { user_id: number; pseudo: string; sticker: string | null; avatar_path: string | null; score: number | null };
export function getNightScores(nightId: number): NightScoreRow[] {
  return getDb().prepare(`
    SELECT ns.user_id, u.pseudo, u.sticker, u.avatar_path, ns.score
    FROM night_scores ns JOIN users u ON u.id = ns.user_id
    WHERE ns.night_id = ?`).all(nightId) as NightScoreRow[];
}
export type NightCard = Night & { game_title: string | null; game_cover_path: string | null; game_cover_url: string | null; gagnant_pseudo: string | null; gagnant_score: number | null };
export function getHistoryCards(userId: number): NightCard[] {
  return getDb().prepare(`
    SELECT n.*, g.title AS game_title, g.cover_path AS game_cover_path, g.cover_url AS game_cover_url,
      (SELECT u.pseudo FROM night_scores ns JOIN users u ON u.id = ns.user_id
        WHERE ns.night_id = n.id AND ns.score IS NOT NULL ORDER BY ns.score DESC, u.pseudo LIMIT 1) AS gagnant_pseudo,
      (SELECT ns.score FROM night_scores ns WHERE ns.night_id = n.id AND ns.score IS NOT NULL ORDER BY ns.score DESC LIMIT 1) AS gagnant_score
    FROM nights n LEFT JOIN games g ON g.id = n.game_id
    WHERE n.status = 'termine' AND (n.creator_id = ? OR EXISTS (SELECT 1 FROM night_players np WHERE np.night_id = n.id AND np.user_id = ?))
    ORDER BY n.played_at DESC, n.id DESC`).all(userId, userId) as NightCard[];
}
export function getTodayTermineeNight(userId: number): (Night & { game_title: string | null }) | null {
  return (getDb().prepare(`
    SELECT n.*, g.title AS game_title FROM nights n LEFT JOIN games g ON g.id = n.game_id
    WHERE n.played_at = date('now','localtime') AND n.status = 'termine'
      AND (n.creator_id = ? OR EXISTS (SELECT 1 FROM night_players np WHERE np.night_id = n.id AND np.user_id = ?))
    ORDER BY n.id DESC LIMIT 1`).get(userId, userId) as (Night & { game_title: string | null }) | undefined) ?? null;
}
export type ShelfGame = Game & {
  owner_pseudo: string; owner_sticker: string | null; owner_avatar_path: string | null;
};
// Étagère v3 : une partie commence avec une étagère VIDE. Chaque joueur y ajoute,
// depuis SA ludothèque (jeux perso + ceux de son foyer), ce dont il a envie ce soir.
// « owner_* » porte le pseudo de celui qui a posé la boîte sur l'étagère.
export function getShelfGames(nightId: number): ShelfGame[] {
  return getDb().prepare(`
    SELECT g.*, u.pseudo AS owner_pseudo, u.sticker AS owner_sticker, u.avatar_path AS owner_avatar_path
    FROM night_games ng
    JOIN games g ON g.id = ng.game_id
    JOIN users u ON u.id = ng.added_by
    WHERE ng.night_id = ?
    ORDER BY CASE g.box_format WHEN 'grand' THEN 0 WHEN 'moyen' THEN 1 WHEN 'petit' THEN 2 ELSE 3 END, g.title`)
    .all(nightId) as ShelfGame[];
}
// v3.5 — les votes de la soirée (badge 👍, segmenté « Votés ») : qui a voté quoi.
export type ShelfVote = { game_id: number; user_id: number; pseudo: string };
export function getShelfVotes(nightId: number): ShelfVote[] {
  return getDb().prepare(`
    SELECT gv.game_id, gv.user_id, u.pseudo FROM game_votes gv
    JOIN users u ON u.id = gv.user_id
    WHERE gv.night_id = ? ORDER BY gv.created_at, gv.user_id`).all(nightId) as ShelfVote[];
}
export function isGameOnShelf(nightId: number, gameId: number): boolean {
  return !!getDb().prepare('SELECT 1 FROM night_games WHERE night_id = ? AND game_id = ?').get(nightId, gameId);
}
export type NightGameResult = { ok: true } | { error: string; status: number };

// Ajouter un jeu à la partie : réservé aux joueurs présents, et seulement
// un jeu de SA ludothèque. Un doublon d'ajout est ignoré (premier ajouteur = badge).
export function addNightGame(nightId: number, gameId: number, userId: number, lang: Lang = 'fr'): NightGameResult {
  const db = getDb();
  if (!getNight(nightId)) return { error: t(lang, 'soiree.errPartieIntrouvable'), status: 404 };
  if (!isNightParticipant(nightId, userId)) return { error: t(lang, 'soiree.errSeulsJoueursAjout'), status: 403 };
  const g = db.prepare('SELECT owner_id, foyer_id FROM games WHERE id = ?').get(gameId) as { owner_id: number; foyer_id: number | null } | undefined;
  if (!g) return { error: t(lang, 'soiree.errJeuIntrouvable'), status: 404 };
  const myFoyerId = (db.prepare('SELECT foyer_id FROM users WHERE id = ?').get(userId) as { foyer_id: number | null }).foyer_id;
  const inMyLibrary = g.foyer_id != null ? g.foyer_id === myFoyerId : g.owner_id === userId;
  if (!inMyLibrary) return { error: t(lang, 'soiree.errJeuPasDansLudo'), status: 403 };
  db.prepare('INSERT OR IGNORE INTO night_games (night_id, game_id, added_by) VALUES (?, ?, ?)').run(nightId, gameId, userId);
  // la sélection de l'ajouteur a changé : sa validation saute, il re-confirmera
  db.prepare('UPDATE night_players SET validated_at = NULL WHERE night_id = ? AND user_id = ?').run(nightId, userId);
  notifyNight(nightId); // sync live : la boîte apparaît chez les autres joueurs
  return { ok: true };
}

// Retirer un jeu de la partie : n'importe quel joueur présent peut le faire.
export function removeNightGame(nightId: number, gameId: number, userId: number, lang: Lang = 'fr'): NightGameResult {
  if (!isNightParticipant(nightId, userId)) return { error: t(lang, 'soiree.errSeulsJoueursRetrait'), status: 403 };
  getDb().prepare('DELETE FROM night_games WHERE night_id = ? AND game_id = ?').run(nightId, gameId);
  // une boîte retirée emporte ses votes (v3.5) — pas de vote fantôme dans « Votés 👍 »
  getDb().prepare('DELETE FROM game_votes WHERE night_id = ? AND game_id = ?').run(nightId, gameId);
  getDb().prepare('DELETE FROM game_vetos WHERE night_id = ? AND game_id = ?').run(nightId, gameId); // v4.13.0
  // sa sélection a changé : sa validation saute (idiome v3.0.0, cf. addNightGame)
  getDb().prepare('UPDATE night_players SET validated_at = NULL WHERE night_id = ? AND user_id = ?').run(nightId, userId);
  notifyNight(nightId); // sync live : la boîte disparaît chez les autres joueurs
  return { ok: true };
}

// v3.5 — le vote sur l'étagère : bascule révocable, comme poser/retirer une boîte,
// mais SANS toucher à la validation (le vote n'est pas une boîte).
export function toggleNightVote(nightId: number, gameId: number, userId: number, lang: Lang = 'fr'): NightGameResult {
  const db = getDb();
  const night = getNight(nightId);
  if (!night) return { error: t(lang, 'soiree.errPartieIntrouvable'), status: 404 };
  if (!isNightParticipant(nightId, userId)) return { error: t(lang, 'soiree.errSeulsJoueursVote'), status: 403 };
  if (night.status !== 'creation') return { error: t(lang, night.status === 'en_jeu' ? 'soiree.errVotesFigesEnJeu' : 'soiree.errVotesFigesTermine'), status: 409 };
  if (!isGameOnShelf(nightId, gameId)) return { error: t(lang, 'soiree.errJeuPasSurEtagere'), status: 403 };
  if (db.prepare('SELECT 1 FROM game_votes WHERE night_id = ? AND game_id = ? AND user_id = ?').get(nightId, gameId, userId)) {
    db.prepare('DELETE FROM game_votes WHERE night_id = ? AND game_id = ? AND user_id = ?').run(nightId, gameId, userId);
  } else {
    db.prepare('INSERT OR IGNORE INTO game_votes (night_id, game_id, user_id) VALUES (?, ?, ?)').run(nightId, gameId, userId);
  }
  notifyNight(nightId); // sync live : le compteur bouge chez tout le monde
  return { ok: true };
}
// v4.13.0 — le veto ❌ : un par joueur et par partie, nommé, révocable par son auteur
// jusqu'au lancement. Mêmes gardes que le vote ; ne touche pas à la validation.
export type ShelfVeto = { game_id: number; user_id: number; pseudo: string };
export function getShelfVetos(nightId: number): ShelfVeto[] {
  return getDb().prepare(`
    SELECT gv.game_id, gv.user_id, u.pseudo FROM game_vetos gv
    JOIN users u ON u.id = gv.user_id
    WHERE gv.night_id = ? ORDER BY gv.created_at, gv.user_id`).all(nightId) as ShelfVeto[];
}
export function toggleNightVeto(nightId: number, gameId: number, userId: number, lang: Lang = 'fr'): NightGameResult {
  const db = getDb();
  const night = getNight(nightId);
  if (!night) return { error: t(lang, 'soiree.errPartieIntrouvable'), status: 404 };
  if (!isNightParticipant(nightId, userId)) return { error: t(lang, 'soiree.errSeulsJoueursVote'), status: 403 };
  if (night.status !== 'creation') return { error: t(lang, night.status === 'en_jeu' ? 'soiree.errVotesFigesEnJeu' : 'soiree.errVotesFigesTermine'), status: 409 };
  if (!isGameOnShelf(nightId, gameId)) return { error: t(lang, 'soiree.errJeuPasSurEtagere'), status: 403 };
  const mien = db.prepare('SELECT game_id FROM game_vetos WHERE night_id = ? AND user_id = ?').get(nightId, userId) as { game_id: number } | undefined;
  if (mien?.game_id === gameId) {
    db.prepare('DELETE FROM game_vetos WHERE night_id = ? AND user_id = ?').run(nightId, userId);
  } else {
    if (mien) return { error: t(lang, 'soiree.errVetoDejaUtilise'), status: 409 };
    if (db.prepare('SELECT 1 FROM game_vetos WHERE night_id = ? AND game_id = ?').get(nightId, gameId))
      return { error: t(lang, 'soiree.errVetoDejaEcarte'), status: 409 };
    db.prepare('INSERT INTO game_vetos (night_id, game_id, user_id) VALUES (?, ?, ?)').run(nightId, gameId, userId);
  }
  notifyNight(nightId); // sync live : la boîte se grise chez tout le monde
  return { ok: true };
}
export function isNightParticipant(nightId: number, userId: number): boolean {
  return !!getDb().prepare('SELECT 1 FROM night_players WHERE night_id = ? AND user_id = ?').get(nightId, userId);
}
export function getNightPicks(nightId: number): (Pick & { title: string; pseudo: string })[] {
  return getDb().prepare(`
    SELECT p.*, g.title, u.pseudo FROM picks p
    JOIN games g ON g.id = p.game_id JOIN users u ON u.id = p.spinner_id
    WHERE p.night_id = ? ORDER BY p.id DESC`).all(nightId) as (Pick & { title: string; pseudo: string })[];
}
