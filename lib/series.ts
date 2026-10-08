// v4.14.0 — parties récurrentes. Une série relie des parties programmées ORDINAIRES
// (étagère, invitations, rappel) : chacune garde ses réponses. 4 dates existent d'avance ;
// la suivante est créée au fil de l'eau (completerSeries : page Parties + balayage des
// rappels), jamais par une tâche dédiée. Rien n'est supprimé sans geste explicite.
import { getDb } from './db';
import { emitToUsers } from './events';
import { conflitHoraire, createNight, getNight, getNightPlayers, modifierInfosNuit, supprimerNuit } from './nights';
import { inviter, listeAttente, repondre, type EtatInvitation } from './invitations';
import { t, type Lang } from './i18n';
import type { Night } from './types';

export const AVANCE = 4;
type Res = { ok: true } | { error: string; status: number };

// Arithmétique calendaire en UTC : ni le fuseau ni l'heure d'été n'interviennent.
export function ajouterJours(d: string, n: number): string {
  const [y, m, j] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, j + n)).toISOString().slice(0, 10);
}

const aujourdhui = () => (getDb().prepare("SELECT date('now','localtime') AS d").get() as { d: string }).d;

// Les dates à venir d'une série (non commencées), la plus proche d'abord.
export function occurrencesAVenir(serieId: number): Night[] {
  return getDb().prepare(`
    SELECT * FROM nights WHERE serie_id = ? AND status = 'creation' AND played_at >= date('now','localtime')
    ORDER BY played_at, id`).all(serieId) as Night[];
}

// Ajoute une date à la série : mêmes titre, heure et invités que la date de base.
function ajouterOccurrence(serieId: number, creatorId: number, base: Night, playedAt: string, push: boolean): number {
  const nightId = createNight(creatorId, [creatorId], { playedAt, startTime: base.start_time ?? null, titre: base.titre ?? null, placesMax: base.places_max ?? null, mode: base.mode });
  getDb().prepare('UPDATE nights SET serie_id = ? WHERE id = ?').run(serieId, nightId);
  const invites = getDb().prepare('SELECT user_id, via_cercle FROM night_invites WHERE night_id = ?')
    .all(base.id) as { user_id: number; via_cercle: number | null }[];
  const via = new Map(invites.filter((i) => i.via_cercle != null).map((i) => [i.user_id, i.via_cercle as number]));
  inviter(nightId, creatorId, invites.map((i) => i.user_id), via, push);
  return nightId;
}

// Création : la première date invite (et notifie) comme une partie programmée ; les 3
// suivantes reprennent ses invités sans nouvelle notification.
export function creerSerie(
  creatorId: number,
  opts: { playedAt: string; startTime: string | null; titre: string | null; pas: 1 | 2; placesMax?: number | null; mode?: 'tirage' | 'libre' },
  ids: number[], viaCercle: Map<number, number> = new Map(),
): number {
  const db = getDb();
  const serieId = Number(db.prepare('INSERT INTO series (creator_id, pas) VALUES (?, ?)').run(creatorId, opts.pas).lastInsertRowid);
  const premiere = createNight(creatorId, [creatorId], { playedAt: opts.playedAt, startTime: opts.startTime, titre: opts.titre, placesMax: opts.placesMax ?? null, mode: opts.mode });
  db.prepare('UPDATE nights SET serie_id = ? WHERE id = ?').run(serieId, premiere);
  inviter(premiere, creatorId, ids, viaCercle);
  const base = getNight(premiere)!;
  for (let k = 1; k < AVANCE; k++) ajouterOccurrence(serieId, creatorId, base, ajouterJours(opts.playedAt, 7 * opts.pas * k), false);
  return serieId;
}

// Garde AVANCE dates à venir pour chaque série active. Idempotent ; renvoie le nombre créé.
export function completerSeries(): number {
  const db = getDb();
  const jour = aujourdhui();
  let crees = 0;
  const series = db.prepare('SELECT id, creator_id, pas FROM series WHERE arretee = 0').all() as { id: number; creator_id: number; pas: number }[];
  for (const s of series) {
    let manque = AVANCE - occurrencesAVenir(s.id).length;
    while (manque > 0) {
      const base = db.prepare('SELECT * FROM nights WHERE serie_id = ? ORDER BY played_at DESC, id DESC LIMIT 1').get(s.id) as Night | undefined;
      if (!base) break;
      let date = ajouterJours(base.played_at, 7 * s.pas);
      while (date < jour) date = ajouterJours(date, 7 * s.pas); // serveur arrêté longtemps : on rattrape
      ajouterOccurrence(s.id, s.creator_id, base, date, false);
      crees++; manque--;
    }
  }
  return crees;
}

export type DateSerie = {
  id: number; played_at: string; start_time: string | null; nb_joueurs: number;
  etat: 'createur' | EtatInvitation; conflit: Night | null;
  places_max: number | null; rang_liste: number | null; // v4.14.1
};
export type Serie = { id: number; creator_id: number; pas: number; hote_pseudo: string; titre: string | null; start_time: string | null; dates: DateSerie[] };

// Les séries actives où je joue ou suis invité, avec mon état par date à venir.
export function mesSeries(moi: number): Serie[] {
  const db = getDb();
  const series = db.prepare(`
    SELECT DISTINCT s.id, s.creator_id, s.pas, u.pseudo AS hote_pseudo FROM series s
    JOIN users u ON u.id = s.creator_id JOIN nights n ON n.serie_id = s.id
    WHERE s.arretee = 0 AND n.status = 'creation' AND n.played_at >= date('now','localtime')
      AND (s.creator_id = ? OR EXISTS (SELECT 1 FROM night_invites i WHERE i.night_id = n.id AND i.user_id = ?))
    ORDER BY s.id`).all(moi, moi) as Omit<Serie, 'dates' | 'titre' | 'start_time'>[];
  return series.map((s) => {
    const occ = occurrencesAVenir(s.id);
    const dates = occ.map((n) => {
      const inv = db.prepare('SELECT etat, en_liste FROM night_invites WHERE night_id = ? AND user_id = ?').get(n.id, moi) as { etat: EtatInvitation; en_liste: string | null } | undefined;
      const rang = inv?.en_liste ? listeAttente(n.id).findIndex((u) => u.id === moi) + 1 : null;
      return {
        id: n.id, played_at: n.played_at, start_time: n.start_time ?? null,
        nb_joueurs: getNightPlayers(n.id).length,
        etat: s.creator_id === moi ? 'createur' as const : inv?.etat ?? 'attente',
        conflit: conflitHoraire(moi, n),
        places_max: n.places_max ?? null, rang_liste: rang,
      };
    });
    return { ...s, titre: occ[0]?.titre ?? null, start_time: occ[0]?.start_time ?? null, dates };
  });
}

function serieDe(serieId: number): { id: number; creator_id: number; arretee: number } | null {
  return (getDb().prepare('SELECT id, creator_id, arretee FROM series WHERE id = ?').get(serieId) as { id: number; creator_id: number; arretee: number } | undefined) ?? null;
}

// « Dispo à toutes » : je réponds Dispo à chaque date à venir où je suis invité.
export function dispoATous(serieId: number, moi: number, lang: Lang = 'fr'): Res {
  const s = serieDe(serieId);
  if (!s || s.arretee) return { error: t(lang, 'serie.errIntrouvable'), status: 404 };
  let fait = 0;
  for (const n of occurrencesAVenir(serieId)) {
    const inv = getDb().prepare('SELECT etat FROM night_invites WHERE night_id = ? AND user_id = ?').get(n.id, moi) as { etat: EtatInvitation } | undefined;
    if (inv && inv.etat !== 'dispo' && 'ok' in repondre(n.id, moi, 'dispo', lang)) fait++;
  }
  return fait > 0 || occurrencesAVenir(serieId).some((n) => getNightPlayers(n.id).some((p) => p.id === moi))
    ? { ok: true } : { error: t(lang, 'soiree.errPasInvite'), status: 404 };
}

// Toute la série : titre et/ou heure des dates à venir (créateur seulement).
export function modifierSerie(serieId: number, moi: number, infos: { titre?: string | null; startTime?: string | null }, lang: Lang = 'fr'): Res {
  const s = serieDe(serieId);
  if (!s || s.arretee) return { error: t(lang, 'serie.errIntrouvable'), status: 404 };
  if (s.creator_id !== moi) return { error: t(lang, 'soiree.errSeulCreateur'), status: 403 };
  for (const n of occurrencesAVenir(serieId)) {
    const r = modifierInfosNuit(n.id, moi, infos, lang);
    if ('error' in r) return r;
  }
  return { ok: true };
}

// Ce qu'un arrêt supprimerait / garderait (affiché dans la confirmation).
export function bilanArret(serieId: number): { supprimees: number; gardees: number } {
  const occ = occurrencesAVenir(serieId);
  const preparee = (id: number) => !!getDb().prepare('SELECT 1 FROM night_games WHERE night_id = ? LIMIT 1').get(id);
  const gardees = occ.filter((n) => preparee(n.id)).length;
  return { supprimees: occ.length - gardees, gardees };
}

// Arrêter : les dates à venir encore vierges (étagère vide) sont supprimées ; celles dont
// l'étagère est préparée restent, détachées (parties ordinaires) ; le passé ne bouge pas.
export function arreterSerie(serieId: number, moi: number, lang: Lang = 'fr'): { ok: true; supprimees: number; gardees: number } | { error: string; status: number } {
  const s = serieDe(serieId);
  if (!s || s.arretee) return { error: t(lang, 'serie.errIntrouvable'), status: 404 };
  if (s.creator_id !== moi) return { error: t(lang, 'soiree.errSeulCreateur'), status: 403 };
  const db = getDb();
  const bilan = bilanArret(serieId);
  const avertis = new Set<number>();
  for (const n of occurrencesAVenir(serieId)) {
    for (const p of getNightPlayers(n.id)) avertis.add(p.id);
    for (const { user_id } of db.prepare('SELECT user_id FROM night_invites WHERE night_id = ?').all(n.id) as { user_id: number }[]) avertis.add(user_id);
    if (db.prepare('SELECT 1 FROM night_games WHERE night_id = ? LIMIT 1').get(n.id)) {
      db.prepare('UPDATE nights SET serie_id = NULL WHERE id = ?').run(n.id);
    } else {
      supprimerNuit(n.id, moi, lang);
    }
  }
  db.prepare('UPDATE series SET arretee = 1 WHERE id = ?').run(serieId);
  avertis.delete(moi);
  emitToUsers([...avertis]);
  return { ok: true, ...bilan };
}
