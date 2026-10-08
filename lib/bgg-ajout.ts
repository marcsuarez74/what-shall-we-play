import type { BoxFormat } from './types';

/** Fiche renvoyée par GET /api/bgg/thing. */
export interface FicheBgg {
  bggId: number; title: string; year: number | null; publisher: string | null;
  minPlayers: number | null; maxPlayers: number | null; playtimeMin: number | null;
  weight: number | null; rating: number | null; designer: string | null;
  artist: string | null; bestPlayers: number | null; coverName: string | null;
}

/** Corps de POST /api/games pour un jeu issu de BGG (partagé ajout / import / onboarding). */
export function ficheBggFormData(t: FicheBgg, format: BoxFormat | string, titre?: string): FormData {
  const fd = new FormData();
  fd.append('title', (titre ?? t.title).trim());
  fd.append('box_format', format);
  fd.append('bgg_id', String(t.bggId));
  const vals: Record<string, string | number | null> = {
    year: t.year, publisher: t.publisher, min_players: t.minPlayers,
    max_players: t.maxPlayers, playtime_min: t.playtimeMin,
    weight: t.weight, bgg_rating: t.rating, designer: t.designer,
    artist: t.artist, best_players: t.bestPlayers,
  };
  for (const [k, v] of Object.entries(vals)) if (v !== null && v !== '') fd.append(k, String(v));
  if (t.coverName) fd.append('cover_name', t.coverName);
  return fd;
}
