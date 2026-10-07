import type { UserLite } from './types';

// v4.17.0 — qui a mis un 👍 sur ce jeu : les autres dans l'ordre du vote, moi en
// dernier. Un votant absent de la liste des joueurs (retiré entre-temps) garde son
// pseudo, sans sticker : jamais un vote compté mais invisible.
export function votantsDe(
  votes: { game_id: number; user_id: number; pseudo: string }[],
  gameId: number, players: UserLite[], meId: number,
): UserLite[] {
  const ceJeu = votes.filter((v) => v.game_id === gameId);
  const ordre = [...ceJeu.filter((v) => v.user_id !== meId), ...ceJeu.filter((v) => v.user_id === meId)];
  return ordre.map((v) => players.find((p) => p.id === v.user_id) ?? { id: v.user_id, pseudo: v.pseudo, sticker: null, avatar_path: null });
}
