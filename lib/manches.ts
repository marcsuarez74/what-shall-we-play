import { rankScores } from './ranks';

// v4.19.0 (choix libre) — fonctions PURES (importables côté client) : classement d'une
// manche et podium de la partie. Une manche = les déclarations d'un jeu à un numéro donné.
export type Declaration = { game_id: number; manche: number; user_id: number; pseudo: string; sticker: string | null; avatar_path: string | null; score: number | null };

// Rang dense sur le score ; égalité = même médaille ET manche gagnée par chacun.
// Les joueurs sans score sont hors classement, listés à part.
export function classerManche<T extends { user_id: number; score: number | null }>(lignes: T[]) {
  const classes = rankScores(lignes);
  const sansScore = lignes.filter((l) => l.score == null || !Number.isFinite(l.score));
  const gagnants = classes.filter((c) => c.rank === 1).map((c) => c.user_id);
  return { classes, sansScore, gagnants };
}

// Les manches de la partie, regroupées par jeu puis numéro (ordre de première déclaration).
export function grouperManches<T extends { game_id: number; manche: number }>(plays: T[]): { game_id: number; manche: number; lignes: T[] }[] {
  const m = new Map<string, { game_id: number; manche: number; lignes: T[] }>();
  for (const p of plays) {
    const k = `${p.game_id}:${p.manche}`;
    if (!m.has(k)) m.set(k, { game_id: p.game_id, manche: p.manche, lignes: [] });
    m.get(k)!.lignes.push(p);
  }
  return [...m.values()];
}

// Un podium par partie : nombre de manches gagnées, rang dense, au moins une victoire.
export function podiumPartie<T extends { game_id: number; manche: number; user_id: number; score: number | null }>(plays: T[]): (T & { victoires: number; rank: number })[] {
  const victoires = new Map<number, { ligne: T; n: number }>();
  for (const { lignes } of grouperManches(plays)) {
    for (const uid of classerManche(lignes).gagnants) {
      const v = victoires.get(uid) ?? { ligne: lignes.find((l) => l.user_id === uid)!, n: 0 };
      v.n += 1;
      victoires.set(uid, v);
    }
  }
  const tries = [...victoires.values()].sort((a, b) => b.n - a.n);
  let dernier = Number.NaN, rang = 0;
  return tries.map(({ ligne, n }) => {
    if (n !== dernier) { rang += 1; dernier = n; }
    return { ...ligne, victoires: n, rank: rang };
  });
}
