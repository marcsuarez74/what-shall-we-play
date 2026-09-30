import { getDb } from './db';
import type { Game, BoxFormat } from './types';

const FORMATS: BoxFormat[] = ['mini', 'petit', 'moyen', 'grand'];
export interface NewGame {
  title: string; box_format: BoxFormat; bgg_id?: number | null; year?: number | null;
  publisher?: string | null; min_players?: number | null; max_players?: number | null;
  playtime_min?: number | null; weight?: number | null; bgg_rating?: number | null;
}
export function validateGameInput(body: unknown): { ok: true; value: NewGame } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.title !== 'string' || b.title.trim().length < 1 || b.title.length > 120)
    return { ok: false, error: 'Titre requis (120 caractères max)' };
  if (!FORMATS.includes(b.box_format as BoxFormat))
    return { ok: false, error: 'Choisissez un format de boîte' };
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    ok: true,
    value: {
      title: b.title.trim(), box_format: b.box_format as BoxFormat,
      bgg_id: num(b.bgg_id), year: num(b.year), publisher: typeof b.publisher === 'string' ? b.publisher.slice(0, 120) : null,
      min_players: num(b.min_players), max_players: num(b.max_players),
      playtime_min: num(b.playtime_min), weight: num(b.weight), bgg_rating: num(b.bgg_rating),
    },
  };
}

export function createGame(ownerId: number, g: NewGame, coverPath: string | null = null): number {
  const info = getDb().prepare(`
    INSERT INTO games (owner_id, title, box_format, bgg_id, year, publisher, min_players, max_players, playtime_min, weight, bgg_rating, cover_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    ownerId, g.title, g.box_format, g.bgg_id ?? null, g.year ?? null, g.publisher ?? null,
    g.min_players ?? null, g.max_players ?? null, g.playtime_min ?? null,
    g.weight ?? null, g.bgg_rating ?? null, coverPath);
  return Number(info.lastInsertRowid);
}

export function listMyGames(ownerId: number): Game[] {
  return getDb().prepare('SELECT * FROM games WHERE owner_id = ? ORDER BY box_format, title').all(ownerId) as Game[];
}

export function getGame(id: number): Game | null {
  return (getDb().prepare('SELECT * FROM games WHERE id = ?').get(id) as Game | undefined) ?? null;
}

export function deleteGame(ownerId: number, id: number): { ok: true } | { error: string; status: number } {
  const g = getGame(id);
  if (!g || g.owner_id !== ownerId) return { error: 'Jeu introuvable', status: 404 };
  const picked = getDb().prepare('SELECT 1 FROM picks WHERE game_id = ? LIMIT 1').get(id);
  if (picked) return { error: 'Ce jeu a déjà été tiré lors d\'une soirée', status: 409 };
  getDb().prepare('DELETE FROM games WHERE id = ?').run(id);
  return { ok: true };
}
