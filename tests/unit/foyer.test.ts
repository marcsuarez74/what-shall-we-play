import { describe, it, expect } from 'vitest';
import { registerUser } from '@/lib/auth';
import { createGame, listUserLibrary, deleteGame, getGame, getPickCounts } from '@/lib/games';
import {
  createFoyer, joinFoyerByCode, resolveDupe, leaveFoyer, dissolveFoyer,
  renameFoyer, getFoyerForUser, getUserFoyerId, removeMember,
} from '@/lib/foyers';
import { createNight, getShelfGames, addNightGame, removeNightGame } from '@/lib/nights';
import { getProfileStats, deleteAccount } from '@/lib/users';
import { getDb } from '@/lib/db';

const uid = (p: string) => (registerUser(p, '1234') as { id: number }).id;

describe('foyer — bibliothèque partagée', () => {
  it('créer un foyer : code à 6 caractères sans ambiguïté, jeux transférés, nom par défaut', () => {
    const marc = uid('f_marc');
    const g1 = createGame(marc, { title: 'Azul', box_format: 'moyen' });
    const foyer = createFoyer(marc);
    expect(foyer.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect(foyer.name).toBe('Chez f_marc');
    expect(getUserFoyerId(marc)).toBe(foyer.id);
    expect(listUserLibrary(marc).map((g) => g.id)).toContain(g1); // mes jeux sont devenus ceux du foyer
  });

  it('rejoindre par code (casse ignorée) : les jeux du nouvel arrivant rejoignent la collection commune', () => {
    const marc = uid('f_jm'); const lea = uid('f_jl');
    const foyer = createFoyer(marc);
    createGame(lea, { title: 'Harmonies', box_format: 'petit' });
    const res = joinFoyerByCode(lea, foyer.code.toLowerCase());
    expect(res.dupes).toEqual([]);
    expect(listUserLibrary(lea).map((g) => g.title)).toContain('Harmonies');
    expect(listUserLibrary(marc).map((g) => g.title)).toContain('Harmonies'); // collection commune
  });

  it('code inconnu ou déjà en foyer : erreur explicite', () => {
    const marc = uid('f_x1');
    expect(() => joinFoyerByCode(marc, 'ZZZZZZ')).toThrow(/code/i);
    const lea = uid('f_x2'); const thib = uid('f_x3');
    const foyer = createFoyer(marc);
    joinFoyerByCode(lea, foyer.code);
    createFoyer(thib);
    expect(() => joinFoyerByCode(lea, foyer.code)).toThrow(/déjà/i);
  });

  it('doublons : détectés au titre normalisé (casse/accents), la fusion regroupe les parties jouées', () => {
    const marc = uid('f_dm'); const lea = uid('f_dl');
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
    const marc = uid('f_rm2'); const lea = uid('f_rl2');
    const foyer = createFoyer(marc);
    const horsFoyer = createGame(lea, { title: 'Hors foyer', box_format: 'petit' });
    const dedans = createGame(marc, { title: 'Dedans', box_format: 'petit' });
    joinFoyerByCode(lea, foyer.code);
    expect(() => resolveDupe(dedans, horsFoyer)).toThrow(/même foyer/i);
  });

  it('quitter le foyer : mes ajouts me suivent, le reste reste au foyer', () => {
    const marc = uid('f_qm'); const lea = uid('f_ql');
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
    const marc = uid('f_last');
    createFoyer(marc);
    leaveFoyer(marc);
    expect(getFoyerForUser(marc)).toBeNull();
  });

  it('dissoudre : créateur seulement ; chaque jeu retourne à son ajouteur, tous détachés', () => {
    const marc = uid('f_dim'); const lea = uid('f_dil');
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
    const marc = uid('f_nm'); const lea = uid('f_nl');
    const foyer = createFoyer(marc);
    joinFoyerByCode(lea, foyer.code);
    renameFoyer(lea, 'Chez Marc & Léa');
    expect(getFoyerForUser(marc)?.name).toBe('Chez Marc & Léa');
  });

  it('étagère v3 : chacun ajoute depuis SA ludothèque — Marc pose un jeu du foyer ajouté par Léa, absente de la soirée', () => {
    const marc = uid('f_sm'); const lea = uid('f_sl'); const ami = uid('f_sa');
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
    expect(shelf[0].owner_pseudo).toBe('f_sm'); // badge = qui l'a ajoutée à la soirée
    expect(removeNightGame(n, gl, ami)).toEqual({ ok: true }); // retrait collectif
    expect(getShelfGames(n)).toEqual([]);
  });

  it('suppression d un jeu : chaque membre du foyer le peut, un hors-foyer non', () => {
    const marc = uid('f_gm'); const lea = uid('f_gl'); const zarb = uid('f_gz');
    const g1 = createGame(marc, { title: 'Commun', box_format: 'petit' });
    const g2 = createGame(marc, { title: 'Commun 2', box_format: 'petit' });
    const foyer = createFoyer(marc);
    joinFoyerByCode(lea, foyer.code);
    expect(deleteGame(lea, g1)).toEqual({ ok: true }); // collection commune
    const res = deleteGame(zarb, g2);
    expect('error' in res && res.status).toBe(404);
  });

  it('les stats profil comptent la bibliothèque du foyer', () => {
    const marc = uid('f_ps'); const lea = uid('f_pl');
    createGame(lea, { title: 'De Léa', box_format: 'petit' });
    const foyer = createFoyer(marc);
    joinFoyerByCode(lea, foyer.code);
    expect(getProfileStats(marc).games).toBe(1);
  });

  it('suppression de compte : mes jeux du foyer restent (réattribués), mes jeux perso disparaissent', () => {
    const marc = uid('f_cm'); const lea = uid('f_cl'); const thib = uid('f_ct');
    const gl = createGame(lea, { title: 'Reste au foyer', box_format: 'moyen' });
    const foyer = createFoyer(marc);
    joinFoyerByCode(lea, foyer.code); // les jeux de Léa (dont gl) entrent dans le foyer
    deleteAccount(lea);
    expect(listUserLibrary(marc).map((g) => g.id)).toContain(gl); // réattribué à Marc
    const gt = createGame(thib, { title: 'Perso', box_format: 'petit' });
    deleteAccount(thib);
    expect(getGame(gt)).toBeNull();
  });

  it('retirer un membre : geste du créateur ; ses ajouts le suivent, le foyer reste', () => {
    const marc = uid('f_km'); const lea = uid('f_kl'); const zoe = uid('f_kz');
    const gm = createGame(marc, { title: 'Du foyer (Marc)', box_format: 'moyen' });
    const foyer = createFoyer(marc);
    joinFoyerByCode(lea, foyer.code);
    const gl = createGame(lea, { title: 'Du foyer (Léa)', box_format: 'petit' });
    // gardes : pas le créateur, pas soi-même, pas un membre
    const rZoe = removeMember(foyer.id, lea, zoe);
    const rSelf = removeMember(foyer.id, marc, marc);
    const rGhost = removeMember(999, lea, marc);
    expect('error' in rZoe && rZoe.status).toBe(403);
    expect('error' in rSelf && rSelf.status).toBe(400);
    expect('error' in rGhost && rGhost.status).toBe(404);
    // le créateur retire Léa : ses ajouts la suivent, le foyer garde ceux de Marc
    expect(removeMember(foyer.id, lea, marc)).toEqual({ ok: true });
    expect(getUserFoyerId(lea)).toBeNull();                 // Léa est dehors
    expect(listUserLibrary(lea).map((g) => g.id)).toEqual([gl]); // ses ajouts la suivent
    expect(listUserLibrary(marc).map((g) => g.id)).toEqual([gm]); // la commune reste
    const foyerApres = getFoyerForUser(marc);
    expect(foyerApres?.members.length).toBe(1);             // le foyer survit
    expect(foyerApres?.members[0].pseudo).toBe('f_km');
  });
});
