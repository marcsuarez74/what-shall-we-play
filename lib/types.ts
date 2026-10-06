export type BoxFormat = 'mini' | 'petit' | 'moyen' | 'grand';

export interface UserRow { id: number; pseudo: string; code_hash: string; created_at: string;
  sticker?: string | null; avatar_path?: string | null; lang?: string;
  est_invite?: number; host_id?: number | null; }
export interface UserLite { id: number; pseudo: string; sticker?: string | null; avatar_path?: string | null; validated_at?: string | null; }
export interface Game {
  id: number; owner_id: number; foyer_id?: number | null; bgg_id: number | null; title: string;
  year: number | null; publisher: string | null; cover_url: string | null; cover_path: string | null;
  min_players: number | null; max_players: number | null; playtime_min: number | null;
  weight: number | null; bgg_rating: number | null; box_format: BoxFormat; created_at: string;
  designer: string | null; artist: string | null; best_players: number | null;
  owner_pseudo?: string; owner_sticker?: string | null; owner_avatar_path?: string | null;
}
export interface Night { id: number; creator_id: number; played_at: string; start_time?: string | null; ended_at?: string | null; status: 'creation' | 'en_jeu' | 'termine'; game_id?: number | null; lien_token?: string | null; created_at: string; }
export interface Foyer { id: number; name: string; invite_code: string; created_by: number; created_at: string; }
export interface Pick { id: number; night_id: number; game_id: number; spinner_id: number; created_at: string; }
