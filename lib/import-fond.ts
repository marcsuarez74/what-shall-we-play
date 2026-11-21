// lib/import-fond.ts — v4.23.0 : import Myludo en tâche de fond (maquette
// mockup/2026-11-21-v4230-import-fond.html). Le navigateur lit le fichier et envoie les lignes ;
// le serveur cherche chaque titre sur BGG, puis ajoute la sélection. L'état vit en base :
// on peut quitter la page, fermer l'app, ou redémarrer le serveur (reprise au démarrage).
import { getDb } from './db';
import { searchBoardgames, getThing, getThings, attachCover } from './bgg';
import {
  rapprocher, requeteBgg, titresRepli, departager, memeTitre, doublonsFichier, compter,
  type LigneCsv, type Rapprochement, type LigneImport, type FicheLigne, type EtatLigne,
  type ResultatAjout, type StatutImport, type ImportInfo, type ResumeImport,
} from './import-csv';
import { listUserLibrary, createGame, enrichirJeu, validateGameInput } from './games';
import { getUserFoyerId } from './foyers';
import { isSafeCoverName } from './storage';
import { notifier } from './push';
import { emitToUsers } from './events';
import { t } from './i18n';
import { FORMATS } from './formats';
import type { BoxFormat } from './types';

interface RowImport { id: number; user_id: number; nom: string; format: string; statut: StatutImport; ext: number; fmt: string; vu: number }
interface RowLigne {
  i: number; csv_json: string; etat: EtatLigne; coche: number; fiche_json: string | null;
  candidats_json: string; deja_id: number | null; resolu: number; resultat: ResultatAjout | null; cov: number;
}

const ligneDe = (r: RowLigne): LigneImport => ({
  i: r.i, csv: JSON.parse(r.csv_json), etat: r.etat, coche: !!r.coche,
  fiche: r.fiche_json ? JSON.parse(r.fiche_json) : null, candidats: JSON.parse(r.candidats_json),
  dejaId: r.deja_id, resolu: !!r.resolu, resultat: r.resultat, cov: !!r.cov,
});
const infoDe = (r: RowImport): ImportInfo => ({
  nom: r.nom, format: r.format === 'json' ? 'json' : 'csv', statut: r.statut, ext: !!r.ext, fmt: r.fmt, vu: !!r.vu,
});

function rowImport(userId: number): RowImport | undefined {
  return getDb().prepare('SELECT * FROM imports WHERE user_id = ?').get(userId) as RowImport | undefined;
}
function rowImportId(id: number): RowImport | undefined {
  return getDb().prepare('SELECT * FROM imports WHERE id = ?').get(id) as RowImport | undefined;
}
function lignesDe(importId: number): LigneImport[] {
  return (getDb().prepare('SELECT * FROM import_lignes WHERE import_id = ? ORDER BY i').all(importId) as RowLigne[]).map(ligneDe);
}
const toucher = (id: number) => getDb().prepare("UPDATE imports SET maj_le = datetime('now') WHERE id = ?").run(id);

/** Écrit une partie d'une ligne (seulement les champs donnés). */
function ecrire(importId: number, i: number, p: Partial<LigneImport>): void {
  const col: Record<string, unknown> = {};
  if (p.etat !== undefined) col.etat = p.etat;
  if (p.coche !== undefined) col.coche = p.coche ? 1 : 0;
  if (p.fiche !== undefined) col.fiche_json = p.fiche ? JSON.stringify(p.fiche) : null;
  if (p.candidats !== undefined) col.candidats_json = JSON.stringify(p.candidats);
  if (p.dejaId !== undefined) col.deja_id = p.dejaId;
  if (p.resolu !== undefined) col.resolu = p.resolu ? 1 : 0;
  if (p.resultat !== undefined) col.resultat = p.resultat;
  if (p.cov !== undefined) col.cov = p.cov ? 1 : 0;
  const cles = Object.keys(col);
  if (!cles.length) return;
  getDb().prepare(`UPDATE import_lignes SET ${cles.map((k) => `${k} = @${k}`).join(', ')} WHERE import_id = @importId AND i = @i`)
    .run({ ...col, importId, i });
  toucher(importId);
}

// ── Lecture ──────────────────────────────────────────────────────────────────
export function lireImport(userId: number): { import: ImportInfo; lignes: LigneImport[] } | null {
  const r = rowImport(userId);
  return r ? { import: infoDe(r), lignes: lignesDe(r.id) } : null;
}
export function resumeImport(userId: number): ResumeImport | null {
  const r = rowImport(userId);
  if (!r) return null;
  const c = compter(lignesDe(r.id), !!r.ext);
  return { statut: r.statut, vu: !!r.vu, nom: r.nom, tot: c.tot, faits: c.faits, choisir: c.choisir, chercher: c.chercher, aAjouter: c.aAjouter, ajoutes: c.ajoutes };
}

// ── Création / réglages / abandon ────────────────────────────────────────────
/** Un seul import par compte : un nouveau remplace l'ancien (les jeux déjà ajoutés restent). */
export function creerImport(userId: number, nom: string, format: 'csv' | 'json', csv: LigneCsv[], ext: boolean, fmt: BoxFormat): void {
  const db = getDb();
  const ludo = listUserLibrary(userId);
  const doublons = doublonsFichier(csv);
  const id = db.transaction(() => {
    db.prepare('DELETE FROM imports WHERE user_id = ?').run(userId);
    const res = db.prepare('INSERT INTO imports (user_id, nom, format, ext, fmt) VALUES (?, ?, ?, ?, ?)')
      .run(userId, nom.slice(0, 120), format, ext ? 1 : 0, fmt);
    const importId = Number(res.lastInsertRowid);
    const ins = db.prepare('INSERT INTO import_lignes (import_id, i, csv_json, etat, coche) VALUES (?, ?, ?, ?, ?)');
    csv.forEach((c, i) => {
      const etat: EtatLigne = doublons.has(i) ? 'doublon' : memeTitre(c.titre, ludo)?.bgg_id != null ? 'deja' : 'att';
      ins.run(importId, i, JSON.stringify(c), etat, etat === 'att' && (ext || !c.extension) ? 1 : 0);
    });
    return importId;
  })();
  lancer(id);
}

export function abandonnerImport(userId: number): void {
  getDb().prepare('DELETE FROM imports WHERE user_id = ?').run(userId);
}

type Reglage = { ext?: boolean; fmt?: string; vu?: boolean };
/** Extensions incluses ou non, format par défaut, bilan vu. Inclure les extensions relance la recherche. */
export function reglerImport(userId: number, r: Reglage): boolean {
  const imp = rowImport(userId);
  if (!imp) return false;
  const db = getDb();
  if (r.fmt !== undefined && FORMATS.includes(r.fmt as BoxFormat)) db.prepare('UPDATE imports SET fmt = ? WHERE id = ?').run(r.fmt, imp.id);
  if (r.vu) db.prepare('UPDATE imports SET vu = 1 WHERE id = ?').run(imp.id);
  if (r.ext !== undefined && (imp.statut === 'recherche' || imp.statut === 'pret')) {
    db.prepare('UPDATE imports SET ext = ? WHERE id = ?').run(r.ext ? 1 : 0, imp.id);
    db.prepare(`UPDATE import_lignes SET coche = ? WHERE import_id = ? AND etat IN ('att','ok','multi','none','echec','enrichir')
                AND json_extract(csv_json, '$.extension') = 1`).run(r.ext ? 1 : 0, imp.id);
    if (r.ext && lignesDe(imp.id).some((l) => l.etat === 'att')) {
      db.prepare("UPDATE imports SET statut = 'recherche' WHERE id = ?").run(imp.id);
      lancer(imp.id);
    }
  }
  toucher(imp.id);
  return true;
}

type Choix = { coche: boolean } | { bggId: number } | { sansCov: true };
/** Décision sur une ligne : cocher/décocher, choisir un jeu BGG, ou garder sans pochette. */
export async function deciderLigne(userId: number, i: number, c: Choix): Promise<boolean> {
  const imp = rowImport(userId);
  if (!imp || (imp.statut !== 'recherche' && imp.statut !== 'pret')) return false;
  const l = lignesDe(imp.id).find((x) => x.i === i);
  if (!l || l.etat === 'deja' || l.etat === 'doublon') return false;
  if ('coche' in c) ecrire(imp.id, i, { coche: c.coche });
  else if ('sansCov' in c) ecrire(imp.id, i, { etat: 'none', fiche: null, coche: true, resolu: true });
  else {
    const f = await getThing(c.bggId);
    if (!f) return false;
    ecrire(imp.id, i, { dejaId: null, ...placer(userId, l.csv, f), coche: true, resolu: true });
  }
  return true;
}

/** Lance l'ajout de la sélection (ou relance les échecs). */
export function lancerAjout(userId: number, reessayer = false): boolean {
  const imp = rowImport(userId);
  if (!imp) return false;
  const db = getDb();
  if (reessayer && imp.statut === 'fini') db.prepare("UPDATE import_lignes SET resultat = NULL WHERE import_id = ? AND resultat = 'echec'").run(imp.id);
  else if (imp.statut !== 'pret') return false;
  db.prepare("UPDATE imports SET statut = 'ajout', vu = 0 WHERE id = ?").run(imp.id);
  toucher(imp.id);
  lancer(imp.id);
  return true;
}

// ── Recherche d'une ligne (ex-boucle du navigateur, v4.20–v4.22) ─────────────
/** Recherche BGG avec repli si rien n'est trouvé (v4.22.0) : titres simplifiés, puis les extensions. */
async function rapprocherLigne(l: LigneCsv): Promise<Rapprochement> {
  const essais: [string, boolean][] = [[requeteBgg(l.titre), l.extension],
    ...titresRepli(l.titre).map((q): [string, boolean] => [q, l.extension])];
  if (!l.extension) essais.push([requeteBgg(l.titre), true]);
  for (const [k, [q, ext]] of essais.entries()) {
    const r = rapprocher(k === 0 ? l.titre : q, l.annee, await searchBoardgames(q, ext));
    if (r.etat === 'multi') return (await parAuteurs(l, r.candidats)) ?? r;
    if (r.etat !== 'none') return r;
  }
  return { etat: 'none' };
}
/** Homonymes : un seul partage un auteur avec Myludo → c'est lui (v4.22.2). */
async function parAuteurs(l: LigneCsv, candidats: { bggId: number }[]): Promise<Rapprochement | null> {
  if (!l.auteurs) return null;
  try {
    const elu = departager(l.auteurs, await getThings(candidats.slice(0, 20).map((c) => c.bggId)));
    return elu && { etat: 'ok', ...elu };
  } catch { return null; }
}
/** Jeu trouvé : déjà dans la ludothèque (même bgg_id, ou même titre déjà lié) / à compléter / nouveau. */
function placer(userId: number, csv: LigneCsv, f: FicheLigne): Partial<LigneImport> {
  const ludo = listUserLibrary(userId);
  const parTitre = memeTitre(csv.titre, ludo);
  if (ludo.some((g) => g.bgg_id === f.bggId) || parTitre?.bgg_id != null) return { fiche: f, etat: 'deja', coche: false };
  if (parTitre) return { fiche: f, etat: 'enrichir', dejaId: parTitre.id };
  return { fiche: f, etat: 'ok' };
}
async function chercherLigne(userId: number, l: LigneImport): Promise<Partial<LigneImport>> {
  try {
    const r = await rapprocherLigne(l.csv);
    if (r.etat === 'multi') return { etat: 'multi', candidats: r.candidats };
    if (r.etat === 'none') return { etat: 'none' };
    const f = await getThing(r.bggId);
    return f ? placer(userId, l.csv, f) : { etat: 'echec' };
  } catch { return { etat: 'echec' }; }
}

// ── Ajout d'une ligne (ex-importer() du navigateur) ─────────────────────────
async function ajouterLigne(userId: number, fmt: string, l: LigneImport): Promise<{ resultat: ResultatAjout; cov: boolean }> {
  let f = l.fiche;
  if (f) { const plein = await getThing(f.bggId); if (plein) f = await attachCover(plein); }
  const c = l.csv;
  // La fiche BGG, puis ce que dit le fichier quand il le dit.
  const v = {
    bgg_id: f?.bggId ?? null, year: f?.year ?? c.annee, publisher: c.editeur ?? f?.publisher ?? null,
    min_players: c.minJoueurs ?? f?.minPlayers ?? null, max_players: c.maxJoueurs ?? f?.maxPlayers ?? null,
    playtime_min: c.duree ?? f?.playtimeMin ?? null, weight: f?.weight ?? null, bgg_rating: f?.rating ?? null,
    designer: c.auteurs ?? f?.designer ?? null, artist: c.illustrateurs ?? f?.artist ?? null,
    best_players: f?.bestPlayers ?? null,
  };
  const cover = f?.coverName && isSafeCoverName(f.coverName) ? f.coverName : null;
  try {
    if (l.etat === 'enrichir' && l.dejaId != null) {
      const court = (x: string | null) => x?.slice(0, 120) ?? null;
      const res = enrichirJeu(userId, l.dejaId, { ...v, publisher: court(v.publisher), designer: court(v.designer), artist: court(v.artist), cover_name: cover });
      return { resultat: 'error' in res ? 'echec' : 'enrichi', cov: !!cover };
    }
    const g = validateGameInput({ ...v, title: c.titre, box_format: fmt });
    if (!g.ok) return { resultat: 'echec', cov: false };
    createGame(userId, g.value, cover, getUserFoyerId(userId));
    return { resultat: 'importe', cov: !!cover };
  } catch { return { resultat: 'echec', cov: false }; }
}

// ── Boucle de fond ───────────────────────────────────────────────────────────
// Une boucle par import, au plus (globalThis : survit au rechargement à chaud en dev).
const g = globalThis as unknown as { wspImports?: Set<number> };
const actifs = (g.wspImports ??= new Set<number>());

function lancer(id: number): void {
  if (actifs.has(id)) return;
  actifs.add(id);
  void boucle(id);
}

async function boucle(id: number): Promise<void> {
  try {
    for (;;) {
      const imp = rowImportId(id);
      if (!imp) return;
      const c = compter(lignesDe(id), !!imp.ext);
      if (imp.statut === 'recherche') {
        const l = c.visibles.find((x) => x.etat === 'att');
        if (!l) { fin(imp, 'pret'); return; }
        const p = await chercherLigne(imp.user_id, l);
        // Pendant la recherche, la personne a pu décocher : on ne remet pas la coche, sauf « déjà là ».
        ecrire(id, l.i, p);
      } else if (imp.statut === 'ajout') {
        const l = c.selection.find((x) => !x.resultat);
        if (!l) { fin(imp, 'fini'); return; }
        ecrire(id, l.i, await ajouterLigne(imp.user_id, imp.fmt, l));
      } else return;
    }
  } catch (e) {
    console.warn('[import]', e); // la ligne reste en attente : reprise au prochain démarrage
  } finally { actifs.delete(id); }
}

/** Fin d'étape : nouveau statut, puis notification (« Recherche terminée » / « Collection importée »). */
function fin(imp: RowImport, statut: 'pret' | 'fini'): void {
  getDb().prepare('UPDATE imports SET statut = ? WHERE id = ?').run(statut, imp.id);
  toucher(imp.id);
  if (statut === 'fini') emitToUsers([imp.user_id]); // la ludothèque a changé
  const lignes = lignesDe(imp.id);
  const c = compter(lignes, !!imp.ext);
  const neufs = lignes.filter((l) => l.resultat === 'importe').length;
  const comp = lignes.filter((l) => l.resultat === 'enrichi').length;
  void notifier([imp.user_id], 'import', (lang) => statut === 'fini'
    ? { titre: t(lang, 'notif.importFiniTitre'), corps: t(lang, 'notif.importFiniCorps', { n: neufs, c: comp }), url: '/games/import-csv', tag: 'import' }
    : {
        titre: t(lang, 'notif.importPretTitre'),
        corps: c.choisir + c.chercher > 0
          ? t(lang, 'notif.importPretAgir', { ok: c.tot - c.choisir - c.chercher, v: c.choisir, x: c.chercher })
          : t(lang, 'notif.importPretTout'),
        url: '/games/import-csv', tag: 'import',
      }).catch(() => {});
}

/** Au démarrage : reprend les imports interrompus (recherche ou ajout en cours). */
export function reprendreImports(): void {
  const ids = getDb().prepare("SELECT id FROM imports WHERE statut IN ('recherche','ajout')").all() as { id: number }[];
  for (const { id } of ids) lancer(id);
}
