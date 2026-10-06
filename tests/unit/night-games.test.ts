import { describe, it, expect } from 'vitest';
import { registerUser } from '@/lib/auth';
import { createGame } from '@/lib/games';
import { createNight, getShelfGames, addNightGame, removeNightGame, isGameOnShelf } from '@/lib/nights';

const uid = (p: string) => (registerUser(p, '1234') as { id: number }).id;

describe('étagère v3 — chacun ajoute depuis sa ludothèque', () => {
  it('étagère vide à la création ; chaque ajout la fait grandir, badge = qui a ajouté', () => {
    const marc = uid('ng_marc'); const lea = uid('ng_lea');
    const gm = createGame(marc, { title: 'A Grand', box_format: 'grand' });
    const gl = createGame(lea, { title: 'B Moyen', box_format: 'moyen' });
    const n = createNight(marc, [marc, lea]);
    expect(getShelfGames(n)).toEqual([]); // vide tant que personne n'a ajouté
    addNightGame(n, gm, marc);
    addNightGame(n, gl, lea);
    const shelf = getShelfGames(n);
    expect(shelf.map((x) => x.title)).toEqual(['A Grand', 'B Moyen']); // ordre par format
    expect(shelf[0].owner_pseudo).toBe('ng_marc'); // « apporté par » = qui l'a ajoutée
    expect(shelf[1].owner_pseudo).toBe('ng_lea');
  });

  it('ajout : réservé aux joueurs de la soirée et aux jeux de SA ludothèque', () => {
    const marc = uid('ng_xm'); const lea = uid('ng_xl'); const zarb = uid('ng_xz');
    const gMarc = createGame(marc, { title: 'De Marc', box_format: 'petit' });
    const gLea = createGame(lea, { title: 'De Léa', box_format: 'petit' });
    const n = createNight(marc, [marc, lea]);
    const rZarb = addNightGame(n, gMarc, zarb);
    const rLea = addNightGame(n, gLea, marc);
    expect('error' in rZarb && rZarb.status).toBe(403); // pas joueur de la soirée
    expect('error' in rLea && rLea.status).toBe(403);  // pas dans MA ludothèque
    expect(addNightGame(n, gMarc, marc)).toEqual({ ok: true });
  });

  it('doublon d ajout : pas de seconde ligne, le premier ajouteur garde le badge', () => {
    const marc = uid('ng_dm'); const lea = uid('ng_dl');
    const g = createGame(marc, { title: 'Unique', box_format: 'moyen' });
    const n = createNight(marc, [marc, lea]);
    addNightGame(n, g, marc);
    addNightGame(n, g, lea); // déjà ajouté par Marc : ignoré
    const shelf = getShelfGames(n);
    expect(shelf).toHaveLength(1);
    expect(shelf[0].owner_pseudo).toBe('ng_dm');
  });

  it('retrait : n importe quel joueur de la soirée peut le faire ; un hors-soirée non', () => {
    const marc = uid('ng_rm'); const lea = uid('ng_rl'); const zarb = uid('ng_rz');
    const g = createGame(marc, { title: 'À retirer', box_format: 'petit' });
    const n = createNight(marc, [marc, lea]);
    addNightGame(n, g, marc);
    expect(isGameOnShelf(n, g)).toBe(true);
    const rZarb = removeNightGame(n, g, zarb);
    expect('error' in rZarb && rZarb.status).toBe(403);
    expect(removeNightGame(n, g, lea)).toEqual({ ok: true }); // retrait collectif
    expect(isGameOnShelf(n, g)).toBe(false);
    expect(getShelfGames(n)).toEqual([]);
  });
});
