import { describe, it, expect } from 'vitest';
import { registerUser } from '@/lib/auth';
import { createGame, listUserLibrary, deleteGame, getGame, getPickCounts } from '@/lib/games';
import {
  createFoyer, joinFoyerByCode, resolveDupe, leaveFoyer, dissolveFoyer,
  renameFoyer, getFoyerForUser, getUserFoyerId,
} from '@/lib/foyers';
import { createNight, getShelfGames, addNightGame, removeNightGame } from '@/lib/nights';
import { getProfileStats, deleteAccount } from '@/lib/users';
import { getDb } from '@/lib/db';

const uid = (p: string) => (registerUser(p, '1234') as { id: number }).id;

describe('foyer — bibliothèque partagée', () => {
  it('créer un foyer : code à 6 caractères sans ambiguïté, jeux transférés, nom par défaut', () => {
    const marc = uid('f-marc');
    const g1 = createGame(marc, { title: 'Azul', box_format: 'moyen' });
    const foyer = createFoyer(marc);
    expect(foyer.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect(foyer.name).toBe('Chez f-marc');
    expect(getUserFoyerId(marc)).toBe(foyer.id);
    expect(listUserLibrary(marc).map((g) => g.id)).toContain(g1); // mes jeux sont devenus ceux du foyer
  });

  it('rejoindre par code (casse ignorée) : les jeux du nouvel arrivant rejoignent la collection commune', () => {
    const marc = uid('f-jm'); const lea = uid('f-jl');
    const foyer = createFoyer(marc);
    createGame(lea, { title: 'Harmonies', box_format: 'petit' });
    const res = joinFoyerByCode(lea, foyer.code.toLowerCase());
    expect(res.dupes).toEqual([]);
    expect(listUserLibrary(lea).map((g) => g.title)).toContain('Harmonies');
    expect(listUserLibrary(marc).map((g) => g.title)).toContain('Harmonies'); // collection commune
  });

  it('code inconnu ou déjà en foyer : erreur explicite', () => {
    const marc = uid('f-x1');
    expect(() => joinFoyerByCode(marc, 'ZZZZZZ')).toThrow(/code/i);
    const lea = uid('f-x2'); const thib = uid('f-x3');
    const foyer = createFoyer(marc);
    joinFoyerByCode(lea, foyer.code);
    createFoyer(thib);
    expect(() => joinFoyerByCode(lea, foyer.code)).toThrow(/déjà/i);
  });

  it('doublons : détectés au titre normalisé (casse/accents), la fusion regroupe les parties jouées', () => {
    const marc = uid('f-dm'); const lea = uid('f-dl');
    const gm = createGame(marc, { title: 'Harmonies', box_format: 'moyen' });
    const gl = createGame(lea, { title: 'Harmônies', box_format: 'petit' }); // doublon accentué
    const n = createNight(lea, [lea]);
    getDb().prepare('INSERT INTO picks (night_id, game_id, spinner_id) VALUES (?, ?, ?)').run(n, gl, lea);
    const foyer = createFoyer(marc);
    const res = joinFoyerByCode(lea, foyer.code);
    expect(res.dupes.length).toBe(1);
    resolveDupe(gl, gm); // on garde la fiche de Léa (la plus jouée), celle de Marc est absorbée
    expect(getGame(gm)).toBeNull();
    expect(listUserLibrary(lea).map((g) => g.id)).toContain(gl);
    expect(getPickCounts()[gl]).toBe(1); // l historique a suivi la fiche conservée
  });

  it('résolution : les deux fiches doivent appartenir au même foyer', () => {
    const marc = uid('f-rm2'); const lea = uid('f-rl2');
    const foyer = createFoyer(marc);
    const horsFoyer = createGame(lea, { title: 'Hors foyer', box_format: 'petit' });
    const dedans = createGame(marc, { title: 'Dedans', box_format: 'petit' });
    joinFoyerByCode(lea, foyer.code);
    expect(() => resolveDupe(dedans, horsFoyer)).toThrow(/même foyer/i);
  });

  it('quitter le foyer : mes ajouts me suivent, le reste reste au foyer', () => {
    const marc = uid('f-qm'); const lea = uid('f-ql');
    createGame(marc, { title: 'De Marc', box_format: 'grand' });
    const foyer = createFoyer(marc);
    createGame(lea, { title: 'De Léa', box_format: 'moyen' });
    joinFoyerByCode(lea, foyer.code);
    leaveFoyer(lea);
    expect(listUserLibrary(lea).map((g) => g.title)).toEqual(['De Léa']);
    expect(listUserLibrary(marc).map((g) => g.title)).toEqual(['De Marc']);
    expect(getFoyerForUser(lea)).toBeNull();
    expect(getFoyerForUser(marc)).not.toBeNull();
  });

  it('dernier membre qui part : le foyer disparaît', () => {
    const marc = uid('f-last');
    createFoyer(marc);
    leaveFoyer(marc);
    expect(getFoyerForUser(marc)).toBeNull();
  });

  it('dissoudre : créateur seulement ; chaque jeu retourne à son ajouteur, tous détachés', () => {
    const marc = uid('f-dim'); const lea = uid('f-dil');
    const foyer = createFoyer(marc);
    joinFoyerByCode(lea, foyer.code);
    const gm = createGame(marc, { title: 'A', box_format: 'grand' });
    const gl = createGame(lea, { title: 'B', box_format: 'moyen' });
    expect(() => dissolveFoyer(lea)).toThrow(/créateur/i);
    dissolveFoyer(marc);
    expect(getFoyerForUser(marc)).toBeNull();
    expect(getFoyerForUser(lea)).toBeNull();
    expect(listUserLibrary(marc).map((g) => g.id)).toEqual([gm]);
    expect(listUserLibrary(lea).map((g) => g.id)).toEqual([gl]);
  });

  it('renommage : n importe quel membre peut renommer', () => {
    const marc = uid('f-nm'); const lea = uid('f-nl');
    const foyer = createFoyer(marc);
    joinFoyerByCode(lea, foyer.code);
    renameFoyer(lea, 'Chez Marc & Léa');
    expect(getFoyerForUser(marc)?.name).toBe('Chez Marc & Léa');
  });

  it('étagère v3 : chacun ajoute depuis SA ludothèque — Marc pose un jeu du foyer ajouté par Léa, absente de la soirée', () => {
    const marc = uid('f-sm'); const lea = uid('f-sl'); const ami = uid('f-sa');
    const gl = createGame(lea, { title: 'Du foyer (Léa)', box_format: 'moyen' });
    const ga = createGame(ami, { title: 'À l ami', box_format: 'petit' });
    const foyer = createFoyer(marc);          // les jeux de Marc entrent au foyer
    joinFoyerByCode(lea, foyer.code);         // ceux de Léa aussi (gl)
    const n = createNight(marc, [marc, ami]); // Léa absente
    expect(getShelfGames(n)).toEqual([]);     // étagère vide à la création
    expect(addNightGame(n, gl, marc)).toEqual({ ok: true }); // le foyer entier est dans MA ludothèque
    const res = addNightGame(n, ga, marc);
    expect("error" in res && res.status).toBe(403);          // le jeu de l'ami n'est pas chez moi
    const shelf = getShelfGames(n);
    expect(shelf.map((x) => x.id)).toEqual([gl]);
    expect(shelf[0].owner_pseudo).toBe('f-sm'); // badge = qui l'a ajoutée à la soirée
    expect(removeNightGame(n, gl, ami)).toEqual({ ok: true }); // retrait collectif
    expect(getShelfGames(n)).toEqual([]);
  });

  it('suppression d un jeu : chaque membre du foyer le peut, un hors-foyer non', () => {
    const marc = uid('f-gm'); const lea = uid('f-gl'); const zarb = uid('f-gz');
    const g1 = createGame(marc, { title: 'Commun', box_format: 'petit' });
    const g2 = createGame(marc, { title: 'Commun 2', box_format: 'petit' });
    const foyer = createFoyer(marc);
    joinFoyerByCode(lea, foyer.code);
    expect(deleteGame(lea, g1)).toEqual({ ok: true }); // collection commune
    const res = deleteGame(zarb, g2);
    expect('error' in res && res.status).toBe(404);
  });

  it('les stats profil comptent la bibliothèque du foyer', () => {
    const marc = uid('f-ps'); const lea = uid('f-pl');
    createGame(lea, { title: 'De Léa', box_format: 'petit' });
    const foyer = createFoyer(marc);
    joinFoyerByCode(lea, foyer.code);
    expect(getProfileStats(marc).games).toBe(1);
  });

  it('suppression de compte : mes jeux du foyer restent (réattribués), mes jeux perso disparaissent', () => {
    const marc = uid('f-cm'); const lea = uid('f-cl'); const thib = uid('f-ct');
    const gl = createGame(lea, { title: 'Reste au foyer', box_format: 'moyen' });
    const foyer = createFoyer(marc);
    joinFoyerByCode(lea, foyer.code); // les jeux de Léa (dont gl) entrent dans le foyer
    deleteAccount(lea);
    expect(listUserLibrary(marc).map((g) => g.id)).toContain(gl); // réattribué à Marc
    const gt = createGame(thib, { title: 'Perso', box_format: 'petit' });
    deleteAccount(thib);
    expect(getGame(gt)).toBeNull();
  });
});
