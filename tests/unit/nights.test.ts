import { describe, it, expect } from 'vitest';
import { registerUser } from '@/lib/auth';
import { createNight, getShelfGames, getActiveNight, userCanAccessNight, setNightPlayers, getMyNights } from '@/lib/nights';
import { createGame } from '@/lib/games';
import { getDb } from '@/lib/db';

describe('nights', () => {
  it('crée une soirée, inclut le créateur, combine les bibliothèques', () => {
    const marc = (registerUser('n-marc', '1234') as { id: number }).id;
    const lea = (registerUser('n-lea', '1234') as { id: number }).id;
    createGame(marc, { title: 'Terraforming Mars', box_format: 'grand' });
    createGame(lea, { title: 'Harmonies', box_format: 'petit' });
    const nightId = createNight(marc, [marc, lea]);
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
