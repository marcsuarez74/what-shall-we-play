import { getDb } from './db';
import { t, type Lang } from './i18n';
import { estFuture, getNight, isGameOnShelf, isNightParticipant, notifyNight, type NightStateError } from './nights';
import type { Declaration } from './manches';

// v4.19.0 (choix libre / marathon) : chacun déclare « j'ai joué » une manche, avec un
// score facultatif. Une ligne par joueur et par manche ; on ne touche qu'à la sienne.
export function getNightPlays(nightId: number): Declaration[] {
  return getDb().prepare(`
    SELECT p.game_id, p.manche, p.user_id, u.pseudo, u.sticker, u.avatar_path, p.score
    FROM night_plays p JOIN users u ON u.id = p.user_id
    WHERE p.night_id = ? ORDER BY p.game_id, p.manche, p.id`).all(nightId) as Declaration[];
}
export function jeuJoue(nightId: number, gameId: number): boolean {
  return !!getDb().prepare('SELECT 1 FROM night_plays WHERE night_id = ? AND game_id = ? LIMIT 1').get(nightId, gameId);
}
export function aDesDeclarations(nightId: number): boolean {
  return !!getDb().prepare('SELECT 1 FROM night_plays WHERE night_id = ? LIMIT 1').get(nightId);
}

function gardes(nightId: number, userId: number, lang: Lang): NightStateError | null {
  const night = getNight(nightId);
  if (!night) return { error: t(lang, 'soiree.errPartieIntrouvable'), status: 404 };
  if (!isNightParticipant(nightId, userId)) return { error: t(lang, 'soiree.errSeulsJoueursVote'), status: 403 };
  if (night.mode !== 'libre') return { error: t(lang, 'libre.errPasLibre'), status: 409 };
  if (night.status === 'termine') return { error: t(lang, 'soiree.errPartieTerminee'), status: 409 };
  if (estFuture(night)) return { error: t(lang, 'soiree.errPasAujourdhui'), status: 409 };
  return null;
}

export function declarerManche(nightId: number, userId: number, gameId: number, manche: number, score: number | null, lang: Lang = 'fr'): { ok: true } | NightStateError {
  const err = gardes(nightId, userId, lang);
  if (err) return err;
  const db = getDb();
  if (!isGameOnShelf(nightId, gameId)) return { error: t(lang, 'soiree.errJeuPasSurEtagere'), status: 400 };
  if (db.prepare('SELECT 1 FROM game_vetos WHERE night_id = ? AND game_id = ?').get(nightId, gameId))
    return { error: t(lang, 'libre.errVeto'), status: 409 };
  const derniere = (db.prepare('SELECT COALESCE(MAX(manche), 0) AS m FROM night_plays WHERE night_id = ? AND game_id = ?').get(nightId, gameId) as { m: number }).m;
  if (!Number.isInteger(manche) || manche < 1 || manche > derniere + 1) return { error: t(lang, 'libre.errManche'), status: 400 };
  if (score !== null && !Number.isFinite(score)) return { error: t(lang, 'soiree.errScoreInvalide'), status: 400 };
  db.prepare(`INSERT INTO night_plays (night_id, game_id, manche, user_id, score) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (night_id, game_id, manche, user_id) DO UPDATE SET score = excluded.score`).run(nightId, gameId, manche, userId, score);
  notifyNight(nightId);
  return { ok: true };
}

export function retirerDeclaration(nightId: number, userId: number, gameId: number, manche: number, lang: Lang = 'fr'): { ok: true } | NightStateError {
  const err = gardes(nightId, userId, lang);
  if (err) return err;
  getDb().prepare('DELETE FROM night_plays WHERE night_id = ? AND game_id = ? AND manche = ? AND user_id = ?').run(nightId, gameId, manche, userId);
  notifyNight(nightId);
  return { ok: true };
}

// Changer le choix du jeu : créateur, partie en préparation, aucune manche déclarée.
export function changerMode(nightId: number, userId: number, mode: unknown, lang: Lang = 'fr'): { ok: true } | NightStateError {
  const night = getNight(nightId);
  if (!night) return { error: t(lang, 'soiree.errPartieIntrouvable'), status: 404 };
  if (mode !== 'tirage' && mode !== 'libre') return { error: t(lang, 'erreurs.requeteInvalide'), status: 400 };
  if (night.creator_id !== userId) return { error: t(lang, 'libre.errSeulCreateur'), status: 403 };
  if ((night.mode ?? 'tirage') === mode) return { ok: true };
  if (night.status !== 'creation' || aDesDeclarations(nightId)) return { error: t(lang, 'libre.errModeVerrouille'), status: 409 };
  getDb().prepare('UPDATE nights SET mode = ? WHERE id = ?').run(mode, nightId);
  notifyNight(nightId);
  return { ok: true };
}
