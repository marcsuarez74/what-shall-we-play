import { describe, it, expect } from 'vitest';
import { registerUser } from '@/lib/auth';
import { createGame, getGame, lierJeu } from '@/lib/games';
import { createFoyer, joinFoyerByCode } from '@/lib/foyers';
import type { ThingResult } from '@/lib/bgg';

// v4.24.0 — « Lier à BGG » depuis la fiche : la fiche choisie remplace les infos, titre et format restent.
let n = 0;
const compte = () => (registerUser(`fe${n++}${Date.now() % 1e6}`, '1234') as { id: number }).id;
const fiche = (bggId: number, coverName: string | null, o: Partial<ThingResult> = {}): ThingResult => ({
  bggId, title: 'Nom BGG', year: 2017, publisher: 'Cephalofair', minPlayers: 1, maxPlayers: 4, playtimeMin: 120,
  weight: 3.9, rating: 8.6, designer: 'Isaac Childres', artist: null, bestPlayers: 3, imageUrl: null, coverName, ...o,
});

describe('lierJeu (v4.24.0)', () => {
  it('remplit la fiche et la pochette ; titre et format intacts', () => {
    const uid = compte();
    const id = createGame(uid, { title: 'Gloom', box_format: 'grand', min_players: 2, publisher: 'Ancien' });
    expect(lierJeu(uid, id, fiche(174430, 'g-174430.webp'))).toEqual({ ok: true });
    expect(getGame(id)).toMatchObject({
      title: 'Gloom', box_format: 'grand', bgg_id: 174430, cover_path: 'g-174430.webp',
      min_players: 1, max_players: 4, publisher: 'Cephalofair', designer: 'Isaac Childres', year: 2017,
    });
  });

  it('pochette : gardée pour la même fiche sans image, oubliée pour une autre fiche', () => {
    const uid = compte();
    const id = createGame(uid, { title: 'Splendor', box_format: 'moyen' });
    lierJeu(uid, id, fiche(148228, 'splendor.jpg'));
    lierJeu(uid, id, fiche(148228, null));
    expect(getGame(id)!.cover_path).toBe('splendor.jpg');
    lierJeu(uid, id, fiche(999001, null));
    expect(getGame(id)).toMatchObject({ bgg_id: 999001, cover_path: null });
    lierJeu(uid, id, fiche(999001, '../evil.jpg')); // nom non sûr : ignoré
    expect(getGame(id)!.cover_path).toBeNull();
  });

  it('un membre du foyer peut lier ; un inconnu non', () => {
    const a = compte(); const b = compte(); const x = compte();
    const f = createFoyer(a);
    joinFoyerByCode(b, f.code);
    const id = createGame(a, { title: 'Azul', box_format: 'moyen' }, null, f.id);
    expect(lierJeu(b, id, fiche(230802, null))).toEqual({ ok: true });
    expect(lierJeu(x, id, fiche(1, null))).toMatchObject({ status: 404 });
    expect(getGame(id)!.bgg_id).toBe(230802);
  });
});
