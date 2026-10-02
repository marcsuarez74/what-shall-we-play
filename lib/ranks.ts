// Classement dense : l'égalité partage la médaille, le rang suivant ne saute pas (1,1,2).
// Un joueur sans score (null / non fini) n'existe pas dans le classement.
export function rankScores<T extends { score: number | null }>(rows: T[]): (T & { rank: number })[] {
  const tries = rows
    .filter((r): r is T & { score: number } => r.score != null && Number.isFinite(r.score))
    .sort((a, b) => b.score - a.score);
  let dernier = Number.NaN;
  let rang = 0;
  return tries.map((r) => {
    if (r.score !== dernier) { rang += 1; dernier = r.score; }
    return { ...r, rank: rang };
  });
}

export const MEDAILLES = ['👑', '🥈', '🥉'] as const;
export const medaille = (rank: number): string => MEDAILLES[rank - 1] ?? '';
