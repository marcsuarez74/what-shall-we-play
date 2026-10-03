import { describe, it, expect } from 'vitest';
import { planifierImport, type JeuBgg } from '@/lib/import-bgg';
import { createGame, validateGameInput, getGame } from '@/lib/games';
import { registerUser } from '@/lib/auth';
import type { Game } from '@/lib/types';

const jeu = (bggId: number, titre: string, annee: number | null = 2020): JeuBgg =>
  ({ bggId, titre, annee, thumb: null });

function ludothequeDe(titres: { titre: string; bggId?: number | null }[]): Game[] {
  const uid = (registerUser(`imp-${Math.random().toString(36).slice(2, 8)}`, '1234') as { id: number }).id;
  return titres.map(({ titre, bggId = null }) => {
    const v = validateGameInput({ title: titre, box_format: 'moyen' });
    if (!v.ok) throw new Error('fixture invalide');
    const id = createGame(uid, { ...v.value, bgg_id: bggId });
    return getGame(id)!;
  });
}

describe('planifierImport', () => {
  it('bgg_id déjà en ludothèque -> dup-bgg (avec l\u2019id du jeu existant)', () => {
    const ludo = ludothequeDe([{ titre: 'Catan', bggId: 13 }]);
    const r = planifierImport([jeu(13, 'Catan')], ludo);
    expect(r).toEqual([{ jeu: jeu(13, 'Catan'), etat: 'dup-bgg', doublonDe: ludo[0]!.id }]);
  });
  it('même titre qu\u2019une fiche SANS bgg_id -> dup-titre, insensible à la casse et aux accents', () => {
    const ludo = ludothequeDe([{ titre: 'harmonies' }]);
    const r = planifierImport([jeu(266192, 'Harmonies')], ludo);
    expect(r[0]).toMatchObject({ etat: 'dup-titre', doublonDe: ludo[0]!.id });
  });
  it('titre identique mais fiche AVEC bgg_id différent -> nouveau (autre édition, pas un doublon)', () => {
    const ludo = ludothequeDe([{ titre: 'Catan', bggId: 13 }]);
    expect(planifierImport([jeu(999, 'Catan')], ludo)[0]!.etat).toBe('nouveau');
  });
  it('rien ne correspond -> nouveau, doublonDe null', () => {
    expect(planifierImport([jeu(174430, 'Gloomhaven')], ludothequeDe([{ titre: 'Dune' }])))
      .toEqual([{ jeu: jeu(174430, 'Gloomhaven'), etat: 'nouveau', doublonDe: null }]);
  });
  it('épingles Review Focus n°3 : après enrichissement (bgg_id posé), la ligne devient dup-bgg', () => {    const ludo = ludothequeDe([{ titre: 'Wingspan', bggId: 266192 }]);
    expect(planifierImport([jeu(266192, 'Wingspan')], ludo)[0]!.etat).toBe('dup-bgg');
  });
});
