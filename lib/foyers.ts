import { getDb } from './db';
import type { Foyer, Game } from './types';
import { getPickCounts } from './games';

// Un foyer partage UNE collection : les jeux appartiennent au foyer (games.foyer_id),
// chaque membre les ajoute, les modifie, les écarte. owner_id reste « qui l'a ajouté »
// (badge « apporté par », et restitution des jeux à la dissolution).

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans I, L, O, 0, 1

export function normalizeTitle(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function genCode(): string {
  let c = '';
  for (let i = 0; i < 6; i++) c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return c;
}

export function getUserFoyerId(userId: number): number | null {
  const u = getDb().prepare('SELECT foyer_id FROM users WHERE id = ?').get(userId) as { foyer_id: number | null } | undefined;
  return u?.foyer_id ?? null;
}

export function getFoyerForUser(userId: number):
  (Foyer & { members: { id: number; pseudo: string; sticker: string | null; avatar_path: string | null; role: 'créateur' | 'membre' }[] }) | null {
  const foyerId = getUserFoyerId(userId);
  if (!foyerId) return null;
  const foyer = getDb().prepare('SELECT * FROM foyers WHERE id = ?').get(foyerId) as Foyer | undefined;
  if (!foyer) return null;
  const members = getDb().prepare(
    `SELECT id, pseudo, sticker, avatar_path FROM users WHERE foyer_id = ?
     ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END, pseudo`).all(foyerId, foyer.created_by) as
    { id: number; pseudo: string; sticker: string | null; avatar_path: string | null }[];
  return {
    ...foyer,
    members: members.map((m) => ({ ...m, role: m.id === foyer.created_by ? 'créateur' as const : 'membre' as const })),
  };
}

export function createFoyer(userId: number, name?: string): { id: number; code: string; name: string } {
  const pseudo = (getDb().prepare('SELECT pseudo FROM users WHERE id = ?').get(userId) as { pseudo: string }).pseudo;
  const foyerName = name?.trim().slice(0, 60) || `Chez ${pseudo}`;
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = genCode();
    try {
      const info = getDb().prepare('INSERT INTO foyers (name, invite_code, created_by) VALUES (?, ?, ?)').run(foyerName, code, userId);
      const id = Number(info.lastInsertRowid);
      getDb().prepare('UPDATE users SET foyer_id = ? WHERE id = ?').run(id, userId);
      getDb().prepare('UPDATE games SET foyer_id = ? WHERE owner_id = ? AND foyer_id IS NULL').run(id, userId);
      return { id, code, name: foyerName };
    } catch { /* collision de code : on régénère */ }
  }
  throw new Error('Impossible de générer un code — réessayez');
}

export function joinFoyerByCode(userId: number, rawCode: string): { id: number; name: string; dupes: { a: Game; b: Game }[] } {
  const code = rawCode.trim().toUpperCase();
  const foyer = getDb().prepare('SELECT * FROM foyers WHERE invite_code = ?').get(code) as Foyer | undefined;
  if (!foyer) throw new Error('Code inconnu — vérifiez auprès du membre qui invite');
  if (getUserFoyerId(userId)) throw new Error('Vous êtes déjà dans un foyer — quittez-le avant d\'en rejoindre un autre');
  getDb().prepare('UPDATE users SET foyer_id = ? WHERE id = ?').run(foyer.id, userId);
  getDb().prepare('UPDATE games SET foyer_id = ? WHERE owner_id = ? AND foyer_id IS NULL').run(foyer.id, userId);
  return { id: foyer.id, name: foyer.name, dupes: findDupes(foyer.id) };
}

// Richesse d'une fiche : tirages d'abord (mémoire des parties), puis métadonnées remplies.
function completeness(g: Game, picks: Record<number, number>): number {
  const filled = [g.year, g.publisher, g.min_players, g.max_players, g.playtime_min,
    g.weight, g.bgg_rating, g.designer, g.artist, g.cover_path].filter((v) => v != null).length;
  return (picks[g.id] ?? 0) * 100 + filled;
}

// Doublons du foyer, au titre normalisé (casse/accents/espaces ignorés — comme la recherche).
// a = fiche suggérée (la plus complète), b = celle proposée à l'absorption.
export function findDupes(foyerId: number): { a: Game; b: Game }[] {
  const games = getDb().prepare(`
    SELECT g.*, u.pseudo AS owner_pseudo, u.sticker AS owner_sticker
    FROM games g LEFT JOIN users u ON u.id = g.owner_id
    WHERE g.foyer_id = ?`).all(foyerId) as Game[];
  const picks = getPickCounts();
  const groups = new Map<string, Game[]>();
  for (const g of games) {
    const k = normalizeTitle(g.title);
    groups.set(k, [...(groups.get(k) ?? []), g]);
  }
  const pairs: { a: Game; b: Game }[] = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((x, y) => completeness(y, picks) - completeness(x, picks) || x.id - y.id);
    for (let i = 1; i < sorted.length; i++) pairs.push({ a: sorted[0], b: sorted[i] });
  }
  return pairs;
}

// Fusion guidée : la fiche conservée absorbe l'historique de l'autre, qui disparaît.
export function resolveDupe(keepId: number, removeId: number): void {
  const db = getDb();
  const keep = db.prepare('SELECT * FROM games WHERE id = ?').get(keepId) as Game | undefined;
  const remove = db.prepare('SELECT * FROM games WHERE id = ?').get(removeId) as Game | undefined;
  if (!keep || !remove || keep.foyer_id == null || keep.foyer_id !== remove.foyer_id)
    throw new Error('Ces deux fiches ne sont pas dans le même foyer');
  db.transaction(() => {
    db.prepare('UPDATE picks SET game_id = ? WHERE game_id = ?').run(keepId, removeId);
    db.prepare('DELETE FROM night_excludes WHERE game_id = ?').run(removeId);
    db.prepare('DELETE FROM games WHERE id = ?').run(removeId);
  })();
}

export function leaveFoyer(userId: number): void {
  const db = getDb();
  const foyerId = getUserFoyerId(userId);
  if (!foyerId) return;
  db.transaction(() => {
    // mes ajouts me suivent ; la collection commune reste au foyer
    db.prepare('UPDATE games SET foyer_id = NULL WHERE foyer_id = ? AND owner_id = ?').run(foyerId, userId);
    db.prepare('UPDATE users SET foyer_id = NULL WHERE id = ?').run(userId);
    const left = db.prepare('SELECT COUNT(*) AS n FROM users WHERE foyer_id = ?').get(foyerId) as { n: number };
    if (left.n === 0) db.prepare('DELETE FROM foyers WHERE id = ?').run(foyerId);
  })();
}

// Retirer un membre : geste réservé au créateur. La règle de sortie s'applique —
// ses ajouts le suivent, la collection commune reste au foyer.
export function removeMember(foyerId: number, targetId: number, byId: number): { ok: true } | { error: string; status: number } {
  const foyer = getDb().prepare('SELECT * FROM foyers WHERE id = ?').get(foyerId) as Foyer | undefined;
  if (!foyer) return { error: 'Foyer introuvable', status: 404 };
  if (foyer.created_by !== byId) return { error: 'Seul le créateur peut retirer un membre', status: 403 };
  if (targetId === byId) return { error: 'Utilisez « Quitter le foyer » pour partir', status: 400 };
  if (getUserFoyerId(targetId) !== foyerId) return { error: "Ce membre n'est pas dans ce foyer", status: 404 };
  leaveFoyer(targetId);
  return { ok: true };
}

export function dissolveFoyer(userId: number): void {
  const db = getDb();
  const foyerId = getUserFoyerId(userId);
  const foyer = db.prepare('SELECT * FROM foyers WHERE id = ? AND created_by = ?').get(foyerId, userId) as Foyer | undefined;
  if (!foyerId || !foyer) throw new Error('Seul le créateur peut dissoudre le foyer');
  db.transaction(() => {
    // chaque jeu retourne à son ajouteur (owner_id conservé, foyer décollé)
    db.prepare('UPDATE games SET foyer_id = NULL WHERE foyer_id = ?').run(foyer.id);
    db.prepare('UPDATE users SET foyer_id = NULL WHERE foyer_id = ?').run(foyer.id);
    db.prepare('DELETE FROM foyers WHERE id = ?').run(foyer.id);
  })();
}

export function renameFoyer(userId: number, name: string): void {
  const foyerId = getUserFoyerId(userId);
  const n = name.trim().slice(0, 60);
  if (!foyerId || !n) throw new Error('Nom de foyer requis');
  getDb().prepare('UPDATE foyers SET name = ? WHERE id = ?').run(n, foyerId);
}
