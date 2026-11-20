// lib/import-csv.ts — import d'une ludothèque depuis un CSV (export Myludo) : lecture du
// fichier et rapprochement avec les résultats de recherche BGG (pur, client-safe).
import type { Game } from './types';

export interface LigneCsv {
  titre: string; annee: number | null; extension: boolean;
  minJoueurs: number | null; maxJoueurs: number | null; duree: number | null;
  editeur: string | null; auteurs: string | null; illustrateurs: string | null;
}
export interface ResultatBgg { bggId: number; name: string; annee: number | null; }
export type Rapprochement =
  | { etat: 'ok'; bggId: number; nom: string }
  | { etat: 'multi'; candidats: ResultatBgg[] }
  | { etat: 'none' };

/** Clé de comparaison : sans casse, accents ni ponctuation (« A - B » = « A: B »). */
export const cleTitre = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Découpe un CSV (guillemets, "" échappés, CRLF) ; séparateur ; ou , lu sur l'en-tête. */
function cellules(txt: string): string[][] {
  const premiere = txt.slice(0, txt.search(/\r?\n|$/));
  const sep = premiere.split(';').length >= premiere.split(',').length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) {
      if (c !== '"') cell += c;
      else if (txt[i + 1] === '"') { cell += '"'; i++; }
      else q = false;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && txt[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** « 1 — 4 » → 1..4 · « Duo » → 2..2 · « Solo » → 1..1 · « 1+ » → 1..null. */
export function lireJoueurs(v: string): { min: number | null; max: number | null } {
  if (/duo/i.test(v)) return { min: 2, max: 2 };
  if (/solo/i.test(v)) return { min: 1, max: 1 };
  const n = (v.match(/\d+/g) ?? []).map(Number);
  if (n.length === 0) return { min: null, max: null };
  if (v.includes('+')) return { min: n[0], max: null };
  return { min: n[0], max: n[1] ?? n[0] };
}

/** « 40 — 80 » → 40 (borne basse, comme la durée BGG) · « » → null. */
export function lireDuree(v: string): number | null {
  const m = v.match(/\d+/);
  return m ? Number(m[0]) : null;
}

/** Lit un export Myludo. null si ce n'en est pas un (pas de colonne « Titre »). */
export function lireCsvMyludo(txt: string): LigneCsv[] | null {
  // BOM, et l'apostrophe que Myludo pose devant la première cellule (anti-formule tableur)
  const rows = cellules(txt.replace(/^﻿/, '').replace(/^'/, ''));
  const tete = (rows.shift() ?? []).map((c) => c.trim());
  const col = (nom: string) => tete.indexOf(nom);
  const iTitre = col('Titre');
  if (iTitre < 0) return null;
  const val = (r: string[], nom: string) => (col(nom) >= 0 ? (r[col(nom)] ?? '').trim() : '');
  const texte = (s: string) => (s ? s.slice(0, 120) : null);
  return rows.filter((r) => (r[iTitre] ?? '').trim()).map((r) => {
    const j = lireJoueurs(val(r, 'Joueur(s)'));
    const annee = Number(val(r, 'Édition'));
    const type = val(r, 'Type');
    return {
      titre: r[iTitre].trim().slice(0, 120),
      annee: Number.isInteger(annee) && annee > 0 ? annee : null,
      extension: type !== '' && type !== 'basegame' && type !== 'standalone',
      minJoueurs: j.min, maxJoueurs: j.max, duree: lireDuree(val(r, 'Durée')),
      editeur: texte(val(r, 'Éditeur(s)').split(',')[0].trim()),
      auteurs: texte(val(r, 'Auteur(s)').split(',').map((s) => s.trim()).join(', ')),
      illustrateurs: texte(val(r, 'Illustrateur(s)').split(',').map((s) => s.trim()).join(', ')),
    };
  });
}

/** Ce qu'on demande à BGG : le titre du jeu de base (« 7 Wonders Duel - Agora » → « 7 Wonders Duel »),
 *  le titre complet départage ensuite — la recherche BGG ne connaît pas nos « - ». */
export const requeteBgg = (titre: string) => titre.split(' - ')[0].trim();

/** Un seul jeu BGG au titre identique → trouvé ; plusieurs ou seulement des voisins → à choisir
 *  (triés par proximité d'année : celle de Myludo est l'édition, pas la sortie) ; rien → introuvable. */
export function rapprocher(titre: string, annee: number | null, resultats: ResultatBgg[]): Rapprochement {
  const uniques = [...new Map(resultats.map((r) => [r.bggId, r])).values()];
  if (uniques.length === 0) return { etat: 'none' };
  const cle = cleTitre(titre);
  const exacts = uniques.filter((r) => cleTitre(r.name) === cle);
  if (exacts.length === 1) return { etat: 'ok', bggId: exacts[0].bggId, nom: exacts[0].name };
  const mots = new Set(cle.split(' '));
  const proximite = (r: ResultatBgg) => cleTitre(r.name).split(' ').filter((m) => mots.has(m)).length;
  const ecart = (r: ResultatBgg) => (annee && r.annee ? Math.abs(annee - r.annee) : 99);
  const candidats = (exacts.length > 1 ? exacts : uniques)
    .sort((a, b) => proximite(b) - proximite(a) || ecart(a) - ecart(b))
    .slice(0, 6);
  return { etat: 'multi', candidats };
}

/** Jeu de la ludothèque au même titre (comparaison sans casse, accents ni ponctuation). */
export function memeTitre(titre: string, ludotheque: Game[]): Game | undefined {
  const cle = cleTitre(titre);
  return ludotheque.find((g) => cleTitre(g.title) === cle);
}

/** Indices des lignes déjà vues plus haut dans le fichier (même titre). */
export function doublonsFichier(lignes: LigneCsv[]): Set<number> {
  const vus = new Set<string>(), doublons = new Set<number>();
  lignes.forEach((l, i) => { const c = cleTitre(l.titre); if (vus.has(c)) doublons.add(i); else vus.add(c); });
  return doublons;
}
