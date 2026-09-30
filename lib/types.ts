export type BoxFormat = 'mini' | 'petit' | 'moyen' | 'grand';

export interface UserRow { id: number; pseudo: string; code_hash: string; created_at: string; }
export interface UserLite { id: number; pseudo: string; }
export interface Game {
  id: number; owner_id: number; bgg_id: number | null; title: string;
  year: number | null; publisher: string | null; cover_url: string | null; cover_path: string | null;
  min_players: number | null; max_players: number | null; playtime_min: number | null;
  weight: number | null; bgg_rating: number | null; box_format: BoxFormat; created_at: string;
  designer: string | null; artist: string | null; best_players: number | null;
}
export interface Night { id: number; creator_id: number; played_at: string; created_at: string; }
export interface Pick { id: number; night_id: number; game_id: number; spinner_id: number; created_at: string; }
