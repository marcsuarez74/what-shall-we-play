import { getDb } from './db';
import { t, type Lang } from './i18n';
import { getNight, isNightParticipant, notifyNight, type NightGameResult } from './nights';

export type Verdict = 'adore' | 'bien' | 'neutre';
const VERDICTS: Verdict[] = ['adore', 'bien', 'neutre'];

// Le verdict du jeu : on ne peut juger qu'une soirée TERMINÉE avec sa boîte posée,
// et seulement si on y était. Revoter remplace (révocable, comme le vote étagère).
// lang : langue du cookie, passée par la route — défaut 'fr' (tests unitaires).
export function poserVerdict(nightId: number, userId: number, verdict: Verdict, lang: Lang = 'fr'): NightGameResult {
  const db = getDb();
  const night = getNight(nightId);
  if (!night) return { error: t(lang, 'soiree.errPartieIntrouvable'), status: 404 };
  if (!isNightParticipant(nightId, userId))
    return { error: t(lang, 'verdict.errSeulsJoueurs'), status: 403 };
  if (night.status !== 'termine')
    return { error: t(lang, night.status === 'en_jeu' ? 'verdict.errEnCours' : 'verdict.errPasCommencee'), status: 409 };
  if (!night.game_id) return { error: t(lang, 'verdict.errAucuneBoite'), status: 409 };
  if (!VERDICTS.includes(verdict)) return { error: t(lang, 'verdict.errInvalide'), status: 400 };
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

// Top 3 de mes jeux « Tu as adoré X : n fois sur total » — agrégat de MES
// verdicts personnels, toutes soirées confondues. Tri total desc, adore desc ;
// la ligne ne s'affiche que si adore ≥ 1 (filtrage UI, pas SQL — KISS).
// game_id voyage avec la ligne : clé React stable même entre jeux homonymes.
export function verdictPersoStats(userId: number) {
  return getDb().prepare(`
    SELECT nv.game_id, g.title AS jeu, SUM(nv.verdict = 'adore') AS adore, COUNT(*) AS total
    FROM night_verdicts nv JOIN games g ON g.id = nv.game_id
    WHERE nv.user_id = ? GROUP BY nv.game_id ORDER BY total DESC, adore DESC LIMIT 3
  `).all(userId) as { game_id: number; jeu: string; adore: number; total: number }[];
}

// Compteurs 😍🙂😐 d'un jeu, toutes soirées confondues (fiche jeu).
export function verdictsJeu(gameId: number): { adore: number; bien: number; neutre: number } {
  const row = getDb().prepare(`
    SELECT SUM(verdict = 'adore') AS adore, SUM(verdict = 'bien') AS bien, SUM(verdict = 'neutre') AS neutre
    FROM night_verdicts WHERE game_id = ?
  `).get(gameId) as { adore: number | null; bien: number | null; neutre: number | null } | undefined;
  return { adore: row?.adore ?? 0, bien: row?.bien ?? 0, neutre: row?.neutre ?? 0 };
}

// Même donnée, groupée pour TOUTE la ludothèque en une requête — le chemin de
// données de la fiche jeu copie getPickCounts (Record par game_id, pas de N+1).
export function verdictsParJeu(): Record<number, { adore: number; bien: number; neutre: number }> {
  const rows = getDb().prepare(`
    SELECT game_id, SUM(verdict = 'adore') AS adore, SUM(verdict = 'bien') AS bien, SUM(verdict = 'neutre') AS neutre
    FROM night_verdicts GROUP BY game_id
  `).all() as { game_id: number; adore: number; bien: number; neutre: number }[];
  return Object.fromEntries(rows.map((r) => [r.game_id, { adore: r.adore, bien: r.bien, neutre: r.neutre }]));
}

// Poids doux au tirage : score = (😍 − 😐)/total, amplitude +8 %/−2 % (asymétrie
// volontaire) lissée par la confiance min(1, n/3). Borne garantée : [×0,98 ; ×1,08]
// — garde-fou du backlog.
export function poidsVerdicts(gameIds: number[]): Map<number, number> {
  const poids = new Map<number, number>();
  if (gameIds.length === 0) return poids;
  const q = gameIds.map(() => '?').join(',');
  const rows = getDb().prepare(`
    SELECT game_id,
           SUM(verdict = 'adore') AS adore,
           SUM(verdict = 'neutre') AS neutre,
           COUNT(*) AS n
    FROM night_verdicts WHERE game_id IN (${q}) GROUP BY game_id
  `).all(...gameIds) as { game_id: number; adore: number; neutre: number; n: number }[];
  const parJeu = new Map(rows.map((r) => [r.game_id, r] as const));
  for (const id of gameIds) {
    const r = parJeu.get(id);
    if (!r) { poids.set(id, 1); continue; }
    const score = (r.adore - r.neutre) / r.n;
    const confiance = Math.min(1, r.n / 3);
    const mult = score > 0 ? 1 + 0.08 * score * confiance
               : score < 0 ? 1 + 0.02 * score * confiance
               : 1;
    poids.set(id, Math.min(1.08, Math.max(0.98, mult)));
  }
  return poids;
}
