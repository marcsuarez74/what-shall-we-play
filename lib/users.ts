import { getDb } from './db';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import { validateCode } from './auth';
import { saveCover, coverPathOnDisk, formatImage } from './storage';
import { ALLOWED_STICKERS } from './stickers';
import { t, type Lang } from './i18n';
import type { UserRow } from './types';
import type { Verdict } from './verdicts';
import { podiumsLibres } from './libre';

export { ALLOWED_STICKERS };

export function getProfileStats(userId: number): {
  plays: number; nights: number; games: number;
  podiums: { un: number; deux: number; trois: number };
} {
  const db = getDb();
  const one = (sql: string) => Number((db.prepare(sql).get(userId) as { n: number }).n);
  // la bibliothèque du foyer si j'en ai un, sinon mes jeux perso
  const games = Number((db.prepare(`SELECT COUNT(*) AS n FROM games g JOIN users u ON u.id = ?
    WHERE (u.foyer_id IS NOT NULL AND g.foyer_id = u.foyer_id)
       OR (u.foyer_id IS NULL AND g.owner_id = ? AND g.foyer_id IS NULL)`).get(userId, userId) as { n: number }).n);
  // Podiums : DENSE_RANK par soirée (égalité = même médaille), scores non nuls
  // uniquement. Le rang se calcule sur TOUS les joueurs de la soirée — le filtre
  // user_id vient APRÈS la fenêtre, sinon chaque rang serait 1.
  const pod = db.prepare(`
    SELECT SUM(CASE WHEN rank = 1 THEN 1 ELSE 0 END) AS un,
           SUM(CASE WHEN rank = 2 THEN 1 ELSE 0 END) AS deux,
           SUM(CASE WHEN rank = 3 THEN 1 ELSE 0 END) AS trois
    FROM (SELECT rank FROM (
            SELECT user_id, DENSE_RANK() OVER (PARTITION BY night_id ORDER BY score DESC) AS rank
            FROM night_scores WHERE score IS NOT NULL)
          WHERE user_id = ?)`)
    .get(userId) as { un: number | null; deux: number | null; trois: number | null };
  const libres = podiumsLibres(userId); // v4.19.0 : un podium par partie libre
  return {
    plays: one('SELECT COUNT(*) AS n FROM picks WHERE spinner_id = ?'),
    nights: one('SELECT COUNT(*) AS n FROM night_players WHERE user_id = ?'),
    games,
    podiums: { un: (pod.un ?? 0) + libres.un, deux: (pod.deux ?? 0) + libres.deux, trois: (pod.trois ?? 0) + libres.trois },
  };
}

// « Mes parties » : mes soirées terminées (créateur ou participant), la plus récente
// d'abord. La médaille n'est PAS stockée : la page (côté serveur) recalcule mon rang via
// rankScores(getNightScores(id)) — au plus `limit` soirées, pas de N+1 client.
// mon_verdict (LEFT JOIN nuit+joueur) : null tant que je n'ai pas jugé la boîte —
// la ligne affiche alors le rappel « Donne ton verdict ».
export function getMyParties(userId: number, limit = 6) {
  // v4.2.0 : les parties terminées SANS scores apparaissent (a_scores=0, pastille
  // « Scores à saisir »). Le filtre créateur/participant remplace celui qu'imposait
  // l'ancien INNER JOIN night_scores — sans lui, les nuits d'autrui fuieraient.
  return getDb().prepare(`
    SELECT n.id, n.played_at, n.mode, g.title AS game_title, g.cover_path, g.cover_url, ns.score, nv.verdict AS mon_verdict,
      EXISTS(SELECT 1 FROM night_scores x WHERE x.night_id = n.id) AS a_scores
    FROM nights n
    LEFT JOIN night_scores ns ON ns.night_id = n.id AND ns.user_id = ?
    LEFT JOIN games g ON g.id = n.game_id
    LEFT JOIN night_verdicts nv ON nv.night_id = n.id AND nv.user_id = ?
    WHERE n.status = 'termine' AND (n.creator_id = ? OR EXISTS (SELECT 1 FROM night_players np WHERE np.night_id = n.id AND np.user_id = ?))
    ORDER BY n.played_at DESC, n.id DESC LIMIT ?`)
    .all(userId, userId, userId, userId, limit) as { id: number; played_at: string; mode: 'tirage' | 'libre'; game_title: string | null; cover_path: string | null; cover_url: string | null; score: number | null; mon_verdict: Verdict | null; a_scores: number }[];
}

export function setSticker(userId: number, sticker: unknown, lang: Lang = 'fr'): { ok: true } | { error: string; status: number } {
  if (typeof sticker !== 'string' || !ALLOWED_STICKERS.includes(sticker))
    return { error: t(lang, 'compte.errSticker'), status: 400 };
  const prev = (getDb().prepare('SELECT avatar_path FROM users WHERE id = ?').get(userId) as { avatar_path: string | null }).avatar_path;
  getDb().prepare('UPDATE users SET sticker = ?, avatar_path = NULL WHERE id = ?').run(sticker, userId);
  if (prev) { try { fs.unlinkSync(coverPathOnDisk(prev)); } catch { /* absent */ } }
  return { ok: true };
}

export function changeCode(userId: number, current: unknown, next: unknown, lang: Lang = 'fr'): { ok: true } | { error: string; status: number } {
  const row = getDb().prepare('SELECT code_hash FROM users WHERE id = ?').get(userId) as UserRow | undefined;
  if (!row || !bcrypt.compareSync(String(current ?? ''), row.code_hash))
    return { error: t(lang, 'compte.errCodeActuel'), status: 401 };
  const err = validateCode(next);
  if (err) return { error: t(lang, 'compte.errNouveauCode'), status: 400 };
  getDb().prepare('UPDATE users SET code_hash = ? WHERE id = ?').run(bcrypt.hashSync(next as string, 10), userId);
  return { ok: true };
}

export function deleteAccount(userId: number): { ok: true; removedGames: number } {
  const db = getDb();
  const files: string[] = [];
  const user = db.prepare('SELECT avatar_path FROM users WHERE id = ?').get(userId) as { avatar_path: string | null } | undefined;
  if (user?.avatar_path) files.push(coverPathOnDisk(user.avatar_path));

  // Foyer : la collection commune survit à mon départ. Mes jeux du foyer sont
  // réattribués à un autre membre (ou me suivent si je suis le dernier — et
  // disparaissent alors avec le compte, comme mes jeux perso).
  const me = db.prepare('SELECT foyer_id FROM users WHERE id = ?').get(userId) as { foyer_id: number | null } | undefined;
  if (me?.foyer_id) {
    const other = db.prepare('SELECT id FROM users WHERE foyer_id = ? AND id != ? ORDER BY id LIMIT 1')
      .get(me.foyer_id, userId) as { id: number } | undefined;
    if (other) {
      db.prepare('UPDATE games SET owner_id = ? WHERE owner_id = ? AND foyer_id = ?').run(other.id, userId, me.foyer_id);
    } else {
      db.prepare('UPDATE games SET foyer_id = NULL WHERE owner_id = ? AND foyer_id = ?').run(userId, me.foyer_id);
      db.prepare('DELETE FROM foyers WHERE id = ?').run(me.foyer_id);
    }
    db.prepare('UPDATE users SET foyer_id = NULL WHERE id = ?').run(userId);
  }

  for (const c of db.prepare('SELECT cover_path FROM games WHERE owner_id = ?').all(userId) as { cover_path: string | null }[])
    if (c.cover_path) files.push(coverPathOnDisk(c.cover_path));

  const removedGames = Number((db.prepare('SELECT COUNT(*) AS n FROM games WHERE owner_id = ?').get(userId) as { n: number }).n);
  db.transaction(() => {
    // 1) tirages visant MES jeux (RESTRICT sinon) — peu importe qui a fait tourner la roue
    db.prepare('DELETE FROM picks WHERE game_id IN (SELECT id FROM games WHERE owner_id = ?)').run(userId);
    // 2) mes tirages sur les jeux des autres
    db.prepare('DELETE FROM picks WHERE spinner_id = ?').run(userId);
    // 3) mes parties créées (cascades picks + night_players de ces parties)
    db.prepare('DELETE FROM nights WHERE creator_id = ?').run(userId);
    // 4) moi (cascades sessions, night_players, games)
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  })();
  for (const f of files) { try { fs.unlinkSync(f); } catch { /* fichier déjà absent */ } }
  return { ok: true, removedGames };
}

// v4.7.2 (audit, point 8) : le format est lu dans les octets, pas dans le nom de fichier.
export async function setAvatar(userId: number, buf: Buffer, lang: Lang = 'fr'): Promise<{ ok: true; path: string } | { error: string; status: number }> {
  if (!formatImage(buf)) return { error: t(lang, 'compte.errFormat'), status: 400 };
  const prev = (getDb().prepare('SELECT avatar_path FROM users WHERE id = ?').get(userId) as { avatar_path: string | null }).avatar_path;
  const name = await saveCover(buf);
  getDb().prepare('UPDATE users SET avatar_path = ?, sticker = NULL WHERE id = ?').run(name, userId);
  if (prev) { try { fs.unlinkSync(coverPathOnDisk(prev)); } catch { /* absent */ } }
  return { ok: true, path: name };
}
