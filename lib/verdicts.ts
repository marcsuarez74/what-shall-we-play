import { getDb } from './db';
import { getNight, isNightParticipant, notifyNight, type NightGameResult } from './nights';

export type Verdict = 'adore' | 'bien' | 'neutre';
const VERDICTS: Verdict[] = ['adore', 'bien', 'neutre'];

// Le verdict du jeu : on ne peut juger qu'une soirée TERMINÉE avec sa boîte posée,
// et seulement si on y était. Revoter remplace (révocable, comme le vote étagère).
export function poserVerdict(nightId: number, userId: number, verdict: Verdict): NightGameResult {
  const db = getDb();
  const night = getNight(nightId);
  if (!night) return { error: 'Partie introuvable', status: 404 };
  if (!isNightParticipant(nightId, userId))
    return { error: 'Seuls les joueurs de la partie peuvent donner leur verdict', status: 403 };
  if (night.status !== 'termine')
    return { error: night.status === 'en_jeu' ? 'La partie est en cours — le verdict se donne après' : 'La soirée n’a pas encore commencé', status: 409 };
  if (!night.game_id) return { error: 'Aucune boîte à juger', status: 409 };
  if (!VERDICTS.includes(verdict)) return { error: 'Verdict invalide', status: 400 };
  db.prepare(`
    INSERT INTO night_verdicts (night_id, user_id, game_id, verdict)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(night_id, user_id)
    DO UPDATE SET verdict = excluded.verdict, game_id = excluded.game_id, created_at = excluded.created_at
  `).run(nightId, userId, night.game_id, verdict);
  notifyNight(nightId); // sync live : le verdict apparaît chez les autres joueurs
  return { ok: true };
}

export function verdictsDeNuit(nightId: number): { adore: number; bien: number; neutre: number } {
  const rows = getDb().prepare(
    'SELECT verdict, COUNT(*) AS n FROM night_verdicts WHERE night_id = ? GROUP BY verdict'
  ).all(nightId) as { verdict: Verdict; n: number }[];
  const compteurs = { adore: 0, bien: 0, neutre: 0 };
  for (const r of rows) compteurs[r.verdict] = r.n;
  return compteurs;
}

export function monVerdict(nightId: number, userId: number): Verdict | null {
  const row = getDb().prepare(
    'SELECT verdict FROM night_verdicts WHERE night_id = ? AND user_id = ?'
  ).get(nightId, userId) as { verdict: Verdict } | undefined;
  return row?.verdict ?? null;
}
