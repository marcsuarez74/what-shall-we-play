import { describe, it, expect } from 'vitest';
import { lireCsvMyludo, lireJoueurs, lireDuree, rapprocher, requeteBgg, memeTitre, doublonsFichier, cleTitre } from '@/lib/import-csv';
import type { Game } from '@/lib/types';

// En-tête et lignes réelles d'un export Myludo (apostrophe de tête comprise).
const TETE = `﻿'ID;Titre;Sous-titre;Édition;Type;EAN;"Prix indicatif";Dimensions;Poids;Joueur(s);Durée;Age(s);Langues;Univers;Gamme(s);Catégorie(s);Thème(s);Mécanisme(s);Éditeur(s);Auteur(s);Illustrateur(s);"Date d'acquisition"`;
const CSV = [
  TETE,
  `96693;"Wondrous Creatures - Winterfall";;2026;extension;3760426550387;45;29.7x25x7;1.3kg;"1 — 4";"40 — 80";14+;français;;"Wondrous Creatures";"Jeu de plateau";Animaux;"Collection";"Bad Comet,Super Meeple";"Yeom Cheolwoong";"Sophia Kang";2026-11-20`,
  `88956;Covenant;;2025;basegame;8436625610010;0;;;"1 — 4";100;14+;anglais;;Covenant;"Jeu de plateau";Nains;"Placement";Devir;"Germán P. Millán";"Enrique Fernández Peláez";2026-10-02`,
  `40856;"Le ""Dilemme"" du Roi";;2020;basegame;;20;;;Duo;30;10+;français;;;;;;"Horrible Guild";"Hjalmar Hach,Lorenzo Silva";;2026-04-16`,
  `1;Yuan;;2023;standalone;;;;;"1+";;;;;;;;;;;;`,
  `2;"Dewan - 4 Camps";;2026;goodie;;;;;;;;;;;;;;;;;`,
].join('\r\n') + '\r\n';

describe('lireCsvMyludo', () => {
  it('lit titre, année, type, joueurs, durée, éditeur, auteurs', () => {
    const l = lireCsvMyludo(CSV)!;
    expect(l).toHaveLength(5);
    expect(l[0]).toEqual({
      titre: 'Wondrous Creatures - Winterfall', annee: 2026, extension: true,
      minJoueurs: 1, maxJoueurs: 4, duree: 40, editeur: 'Bad Comet',
      auteurs: 'Yeom Cheolwoong', illustrateurs: 'Sophia Kang',
    });
    expect(l[1]).toMatchObject({ titre: 'Covenant', extension: false, duree: 100, editeur: 'Devir' });
  });
  it('guillemets échappés, Duo, auteurs multiples, champs vides', () => {
    const l = lireCsvMyludo(CSV)!;
    expect(l[2]).toMatchObject({ titre: 'Le "Dilemme" du Roi', minJoueurs: 2, maxJoueurs: 2, auteurs: 'Hjalmar Hach, Lorenzo Silva', illustrateurs: null });
  });
  it('standalone = jeu de base, goodie = extension', () => {
    const l = lireCsvMyludo(CSV)!;
    expect(l[3]).toMatchObject({ extension: false, minJoueurs: 1, maxJoueurs: null, duree: null, editeur: null });
    expect(l[4].extension).toBe(true);
  });
  it("refuse un fichier sans colonne Titre, accepte la virgule comme séparateur", () => {
    expect(lireCsvMyludo('nom;prix\nCatan;30')).toBeNull();
    expect(lireCsvMyludo('Titre,Édition\nCatan,1995\n')).toEqual([expect.objectContaining({ titre: 'Catan', annee: 1995 })]);
  });
});

describe('joueurs et durée', () => {
  it.each([['1 — 4', 1, 4], ['2 — 10', 2, 10], ['Duo', 2, 2], ['Solo', 1, 1], ['3', 3, 3], ['', null, null]])(
    '%s', (v, min, max) => expect(lireJoueurs(v)).toEqual({ min, max }));
  it('durée = borne basse', () => { expect(lireDuree('60 — 120')).toBe(60); expect(lireDuree('')).toBeNull(); });
});

describe('rapprocher', () => {
  const r = (bggId: number, name: string, annee: number | null = null) => ({ bggId, name, annee });
  it('titre exact unique (ponctuation ignorée) → trouvé', () => {
    expect(rapprocher('7 Wonders Duel - Agora', 2020, [r(1, '7 Wonders Duel'), r(2, '7 Wonders Duel: Agora', 2020)]))
      .toEqual({ etat: 'ok', bggId: 2, nom: '7 Wonders Duel: Agora' });
  });
  it('même jeu listé deux fois (titre alternatif) → trouvé', () => {
    expect(rapprocher('Orléans', 2025, [r(5, 'Orléans', 2014), r(5, 'Orleans', 2014)]).etat).toBe('ok');
  });
  it('plusieurs exacts → à choisir, le plus proche en année d’abord', () => {
    const res = rapprocher('Covenant', 2025, [r(1, 'Covenant', 2008), r(2, 'Covenant', 2025), r(3, 'Covenant: Origins')]);
    expect(res).toEqual({ etat: 'multi', candidats: [r(2, 'Covenant', 2025), r(1, 'Covenant', 2008)] });
  });
  it('seulement des voisins → à choisir, triés par mots communs', () => {
    const res = rapprocher('Kingdom Rush - Rift in Time - Spider Goddess', null,
      [r(1, 'Kingdom Rush: Elemental Uprising'), r(2, 'Kingdom Rush: Rift in Time – Spider Goddess Mini Expansion')]);
    expect(res.etat === 'multi' && res.candidats.map((c) => c.bggId)).toEqual([2, 1]);
  });
  it('aucun résultat → introuvable', () => expect(rapprocher('Dewan', 2026, [])).toEqual({ etat: 'none' }));
});

describe('outils', () => {
  it('requête BGG = titre du jeu de base', () => {
    expect(requeteBgg('Kingdom Rush - Rift in Time - Spider Goddess')).toBe('Kingdom Rush');
    expect(requeteBgg('Covenant')).toBe('Covenant');
  });
  it('clé de titre', () => expect(cleTitre("L'Île Des Mots-Dits")).toBe('l ile des mots dits'));
  it('même titre dans la ludothèque', () => {
    const ludo = [{ id: 7, title: 'Les Charlatans de Belcastel' }] as Game[];
    expect(memeTitre('les charlatans de belcastel', ludo)?.id).toBe(7);
    expect(memeTitre('Catan', ludo)).toBeUndefined();
  });
  it('doublons dans le fichier : la 2e occurrence', () => {
    const l = lireCsvMyludo(['Titre', 'A', 'B', 'a', 'B'].join('\n'))!;
    expect([...doublonsFichier(l)]).toEqual([2, 3]);
  });
});
