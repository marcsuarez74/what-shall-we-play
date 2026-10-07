import type { Game } from './types';



export interface ShelfFilters {
  q: string;
  players: number | null;
  weight: 'all' | 'leger' | 'moyen' | 'lourd';
  // v4.12.0 : 4 plages (l'ancienne « 60+ » est scindée en 60–90 et 90+).
  duration: 'all' | 'court' | 'moyen' | 'long' | 'tres';
  /** Boîte : dimension propre à la ludothèque (l'étagère groupe déjà par format). */
  format: 'all' | Game['box_format'];
}

// Insensible à la casse ET aux accents (les titres français gardent leurs accents,
// les utilisateurs tapent souvent sans).
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// Recherche insensible aux accents, partagée (sélecteur de l'étagère…).
export const normalizeText = norm;

// Filtrage 100 % client de l'étagère. Un jeu SANS donnée (poids/durée/joueurs null)
// n'est jamais écarté par le filtre correspondant — on ne cache pas ce qu'on ne sait pas classer.
export function filterShelf(games: Game[], f: ShelfFilters): Game[] {
  const q = norm(f.q.trim());
  return games.filter((g) => {
    if (q && !norm(g.title).includes(q)) return false;
    if (f.players != null && g.min_players != null && f.players < g.min_players) return false;
    if (f.players != null && g.max_players != null && f.players > g.max_players) return false;
    if (f.weight !== 'all' && g.weight != null) {
      if (f.weight === 'leger' && g.weight >= 2) return false;
      if (f.weight === 'moyen' && (g.weight < 2 || g.weight >= 3)) return false;
      if (f.weight === 'lourd' && g.weight < 3) return false;
    }
    if (f.duration !== 'all' && g.playtime_min != null) {
      if (f.duration === 'court' && g.playtime_min >= 30) return false;
      if (f.duration === 'moyen' && (g.playtime_min < 30 || g.playtime_min > 60)) return false;
      if (f.duration === 'long' && (g.playtime_min <= 60 || g.playtime_min > 90)) return false;
      if (f.duration === 'tres' && g.playtime_min <= 90) return false;
    }
    if (f.format !== 'all' && g.box_format !== f.format) return false;
    return true;
  });
}

// Nombre de familles de filtres actives (badge « Filtres », ligne d'état du tirage).
// La recherche n'en est pas une : elle sert à retrouver une boîte, pas à borner la roue.
export function filtresActifs(f: ShelfFilters): number {
  return (f.players != null ? 1 : 0) + (f.weight !== 'all' ? 1 : 0)
    + (f.duration !== 'all' ? 1 : 0) + (f.format !== 'all' ? 1 : 0);
}
