// lib/import-bgg.ts — classification de l'import BGG (pur, client-safe).
import type { Game } from './types';
import { normalizeText } from './filters';

export interface JeuBgg { bggId: number; titre: string; annee: number | null; thumb: string | null; }
export type EtatLigne = 'nouveau' | 'dup-bgg' | 'dup-titre';
export interface LigneImport { jeu: JeuBgg; etat: EtatLigne; doublonDe: number | null; }

// Prévue en TDD : déjà en ludothèque par bgg_id -> 'dup-bgg' (ignoré) ; même titre
// normalisé qu'une fiche manuelle (sans bgg_id) -> 'dup-titre' (enrichissement) ; sinon 'nouveau'.
export function planifierImport(jeux: JeuBgg[], ludotheque: Game[]): LigneImport[] {
  const parBggId = new Map(ludotheque.filter((g) => g.bgg_id != null).map((g) => [g.bgg_id as number, g.id]));
  const manuels = ludotheque.filter((g) => g.bgg_id == null);
  return jeux.map((jeu) => {
    const deja = parBggId.get(jeu.bggId);
    if (deja != null) return { jeu, etat: 'dup-bgg' as const, doublonDe: deja };
    const manuel = manuels.find((g) => normalizeText(g.title) === normalizeText(jeu.titre));
    return { jeu, etat: (manuel ? 'dup-titre' : 'nouveau') as EtatLigne, doublonDe: manuel?.id ?? null };
  });
}
