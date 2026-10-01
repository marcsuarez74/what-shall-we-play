import { describe, it, expect } from 'vitest';
import { registerUser } from '@/lib/auth';
import { createNight, getShelfGames, getActiveNight, userCanAccessNight, setNightPlayers, getMyNights, addNightGame, removeNightGame, validateSelection, getNightPlayers } from '@/lib/nights';
import { createGame } from '@/lib/games';
import { getDb } from '@/lib/db';

describe('nights', () => {
  it('crée une soirée vide, puis chacun ajoute depuis sa ludothèque', () => {
    const marc = (registerUser('n-marc', '1234') as { id: number }).id;
    const lea = (registerUser('n-lea', '1234') as { id: number }).id;
    const gm = createGame(marc, { title: 'Terraforming Mars', box_format: 'grand' });
    const gl = createGame(lea, { title: 'Harmonies', box_format: 'petit' });
    const nightId = createNight(marc, [marc, lea]);
    expect(getShelfGames(nightId)).toEqual([]); // vide à la création
    addNightGame(nightId, gm, marc);
    addNightGame(nightId, gl, lea);
    const games = getShelfGames(nightId);
    expect(games.map((g) => g.title).sort()).toEqual(['Harmonies', 'Terraforming Mars']);
    expect(getActiveNight(marc)?.id).toBe(nightId);
    expect(userCanAccessNight(lea, nightId)).toBe(true);
    expect(userCanAccessNight((registerUser('n-autre', '1234') as { id: number }).id, nightId)).toBe(false);
  });
  it('modifie les joueurs présents', () => {
    const a = (registerUser('n-a', '1234') as { id: number }).id;
    const b = (registerUser('n-b', '1234') as { id: number }).id;
    const c = (registerUser('n-c', '1234') as { id: number }).id;
    const nightId = createNight(a, [a, b]);
    setNightPlayers(nightId, [a, c]);
    expect(getShelfGames(nightId)).toHaveLength(0); // b parti, c et a n'ont rien
  });
  it('liste mes soirées (créateur ou participant), la plus récente d\'abord', () => {
    const u = (registerUser('n-hist', '1234') as { id: number }).id;
    const autre = (registerUser('n-hist-b', '1234') as { id: number }).id;
    const hier = createNight(u, [u]);
    const invite = createNight(autre, [autre, u]); // je n'y suis qu'invité
    const etrangere = createNight(autre, [autre]); // sans moi
    const quittee = createNight(u, [u, autre]);
    setNightPlayers(quittee, [autre]); // créateur retiré des joueurs : reste visible
    getDb().prepare(`UPDATE nights SET played_at = date('now', '-1 day') WHERE id = ?`).run(hier);
    const ids = getMyNights(u).map((n) => n.id);
    expect(ids).toEqual([quittee, invite, hier]); // played_at DESC, puis id DESC
    expect(ids).not.toContain(etrangere);
  });
  it('getActiveNight suit le jour local (Europe/Paris) et bascule au lendemain', () => {
    const u = (registerUser('n-tz', '1234') as { id: number }).id;
    const nightId = createNight(u, [u]);
    const db = getDb();
    const today = (db.prepare(`SELECT date('now','localtime') AS d`).get() as { d: string }).d;
    const night = getActiveNight(u);
    expect(night?.id).toBe(nightId);
    expect(night?.played_at).toBe(today); // app et base s'accordent sur « aujourd'hui »
    db.prepare(`UPDATE nights SET played_at = date('now','localtime','-1 day') WHERE id = ?`).run(nightId);
    expect(getActiveNight(u)).toBeNull(); // passé au jour suivant : plus de soirée courante
  });
});

describe('validation de sélection', () => {
  it('valide, saute à l\'ajout d\'un jeu, puis re-valide', () => {
    const marc = (registerUser('v-marc', '1234') as { id: number }).id;
    const lea = (registerUser('v-lea', '1234') as { id: number }).id;
    const nightId = createNight(marc, [marc, lea]);
    const valDe = (id: number) => getNightPlayers(nightId).find((p) => p.id === id)?.validated_at ?? null;
    expect(valDe(lea)).toBeNull(); // personne n'a validé à la création

    validateSelection(nightId, lea);
    expect(valDe(lea)).not.toBeNull(); // « Léa a validé sa sélection »
    expect(valDe(marc)).toBeNull(); // marc, lui, n'a pas bougé

    const gl = createGame(lea, { title: 'Harmonies', box_format: 'petit' });
    addNightGame(nightId, gl, lea);
    expect(valDe(lea)).toBeNull(); // sa sélection a changé : re-validation exigée
    validateSelection(nightId, lea);
    expect(valDe(lea)).not.toBeNull();

    // retirer une boîte saute aussi la validation de celui qui la retire
    removeNightGame(nightId, gl, lea);
    expect(valDe(lea)).toBeNull();
  });
  it('refuse un joueur hors de la partie', () => {
    const marc = (registerUser('v-marc2', '1234') as { id: number }).id;
    const zzz = (registerUser('v-hors', '1234') as { id: number }).id;
    const nightId = createNight(marc, [marc]);
    expect(() => validateSelection(nightId, zzz)).toThrow(/pas dans/);
  });
  it('modifier la liste des joueurs préserve la validation de ceux qui restent', () => {
    const marc = (registerUser('v-marc3', '1234') as { id: number }).id;
    const lea = (registerUser('v-lea3', '1234') as { id: number }).id;
    const nightId = createNight(marc, [marc, lea]);
    validateSelection(nightId, lea);
    setNightPlayers(nightId, [marc, lea]); // ré-enregistrement sans changement
    expect(getNightPlayers(nightId).find((p) => p.id === lea)?.validated_at).not.toBeNull();
    // un joueur qui arrive n'est PAS validé d'office
    const thib = (registerUser('v-thib3', '1234') as { id: number }).id;
    setNightPlayers(nightId, [marc, lea, thib]);
    const joueurs = getNightPlayers(nightId);
    expect(joueurs.find((p) => p.id === thib)?.validated_at).toBeNull();
    expect(joueurs.find((p) => p.id === lea)?.validated_at).not.toBeNull(); // léa n'a pas bougé
  });
});
