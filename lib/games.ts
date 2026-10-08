import { getDb } from './db';
import { isSafeCoverName } from './storage';
import { t, type Lang } from './i18n';
import type { Game, BoxFormat } from './types';

const FORMATS: BoxFormat[] = ['mini', 'petit', 'moyen', 'grand'];
export interface NewGame {
  title: string; box_format: BoxFormat; bgg_id?: number | null; year?: number | null;
  publisher?: string | null; min_players?: number | null; max_players?: number | null;
  playtime_min?: number | null; weight?: number | null; bgg_rating?: number | null;
  designer?: string | null; artist?: string | null; best_players?: number | null;
}
// lang : langue du cookie, passée par la route — défaut 'fr' (tests unitaires).
export function validateGameInput(body: unknown, lang: Lang = 'fr'): { ok: true; value: NewGame } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.title !== 'string' || b.title.trim().length < 1 || b.title.length > 120)
    return { ok: false, error: t(lang, 'jeu.errTitre') };
  if (!FORMATS.includes(b.box_format as BoxFormat))
    return { ok: false, error: t(lang, 'jeu.errFormat') };
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    ok: true,
    value: {
      title: b.title.trim(), box_format: b.box_format as BoxFormat,
      bgg_id: num(b.bgg_id), year: num(b.year), publisher: typeof b.publisher === 'string' ? b.publisher.slice(0, 120) : null,
      min_players: num(b.min_players), max_players: num(b.max_players),
      playtime_min: num(b.playtime_min), weight: num(b.weight), bgg_rating: num(b.bgg_rating),
      designer: typeof b.designer === 'string' && b.designer.trim() ? b.designer.slice(0, 120) : null,
      artist: typeof b.artist === 'string' && b.artist.trim() ? b.artist.slice(0, 120) : null,
      best_players: num(b.best_players),
    },
  };
}

export function createGame(ownerId: number, g: NewGame, coverPath: string | null = null, foyerId: number | null = null): number {
  const info = getDb().prepare(`
    INSERT INTO games (owner_id, foyer_id, title, box_format, bgg_id, year, publisher, min_players, max_players, playtime_min, weight, bgg_rating, designer, artist, best_players, cover_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    ownerId, foyerId, g.title, g.box_format, g.bgg_id ?? null, g.year ?? null, g.publisher ?? null,
    g.min_players ?? null, g.max_players ?? null, g.playtime_min ?? null,
    g.weight ?? null, g.bgg_rating ?? null, g.designer ?? null, g.artist ?? null, g.best_players ?? null, coverPath);
  return Number(info.lastInsertRowid);
}

// Nombre de fois que chaque jeu a été tiré (toutes parties confondues) — fiche « Parties jouées ».
export function getPickCounts(): Record<number, number> {
  const rows = getDb().prepare('SELECT game_id, COUNT(*) AS c FROM picks GROUP BY game_id').all() as
    { game_id: number; c: number }[];
  return Object.fromEntries(rows.map((r) => [r.game_id, r.c]));
}

// La bibliothèque d'un utilisateur : celle de son foyer s'il en a un, sinon ses jeux perso.
// Chaque ligne porte l'ajouteur (badge « apporté par » sur les cartes).
export function listUserLibrary(userId: number): Game[] {
  return getDb().prepare(`
    SELECT g.*, u2.pseudo AS owner_pseudo, u2.sticker AS owner_sticker, u2.avatar_path AS owner_avatar_path
    FROM games g
    JOIN users u ON u.id = ?
    LEFT JOIN users u2 ON u2.id = g.owner_id
    WHERE (u.foyer_id IS NOT NULL AND g.foyer_id = u.foyer_id)
       OR (u.foyer_id IS NULL AND g.owner_id = ? AND g.foyer_id IS NULL)
    ORDER BY g.box_format, g.title`).all(userId, userId) as Game[];
}

export function getGame(id: number): Game | null {
  return (getDb().prepare('SELECT * FROM games WHERE id = ?').get(id) as Game | undefined) ?? null;
}

// Collection commune : un jeu du foyer est gérable par chaque membre du foyer,
// un jeu perso par son propriétaire seul.
export function canManageGame(userId: number, g: Game): boolean {
  if (g.foyer_id != null) {
    const me = getDb().prepare('SELECT foyer_id FROM users WHERE id = ?').get(userId) as { foyer_id: number | null } | undefined;
    return !!me && me.foyer_id === g.foyer_id;
  }
  return g.owner_id === userId;
}

export function deleteGame(userId: number, id: number, lang: Lang = 'fr'): { ok: true } | { error: string; status: number } {
  const g = getGame(id);
  if (!g || !canManageGame(userId, g)) return { error: t(lang, 'jeu.errIntrouvable'), status: 404 };
  // v4.19.0 : une manche déclarée en choix libre protège le jeu comme un tirage.
  const picked = getDb().prepare('SELECT 1 FROM picks WHERE game_id = ? UNION ALL SELECT 1 FROM night_plays WHERE game_id = ? LIMIT 1').get(id, id);
  if (picked) return { error: t(lang, 'jeu.errDejaTire'), status: 409 };
  getDb().prepare('DELETE FROM games WHERE id = ?').run(id);
  return { ok: true };
}

// ── Import BGG (v3.6.0) : enrichissement d'une fiche saisie à la main ────────
// N'écrit JAMAIS title/box_format (fidèle à la saisie du joueur) et ne remplace
// jamais une photo perso (COALESCE).
export interface BggEnrich {
  bgg_id: number | null; year: number | null; publisher: string | null;
  min_players: number | null; max_players: number | null; playtime_min: number | null;
  weight: number | null; bgg_rating: number | null; designer: string | null; artist: string | null;
  best_players: number | null; cover_name: string | null;
}
export function enrichirJeu(userId: number, id: number, e: BggEnrich, lang: Lang = 'fr'): { ok: true } | { error: string; status: number } {
  const g = getGame(id);
  if (!g || !canManageGame(userId, g)) return { error: t(lang, 'jeu.errIntrouvable'), status: 404 };
  const cover = e.cover_name && isSafeCoverName(e.cover_name) ? e.cover_name : null;
  getDb().prepare(`UPDATE games SET bgg_id=?, year=?, publisher=?, min_players=?, max_players=?,
                   playtime_min=?, weight=?, bgg_rating=?, designer=?, artist=?, best_players=?,
                   cover_path=COALESCE(cover_path, ?) WHERE id=?`)
    .run(e.bgg_id, e.year, e.publisher, e.min_players, e.max_players, e.playtime_min, e.weight,
         e.bgg_rating, e.designer, e.artist, e.best_players, cover, id);
  return { ok: true };
}
