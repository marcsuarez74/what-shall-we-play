import { describe, expect, test } from 'vitest';
import { registerUser } from '@/lib/auth';
import { ajouterMembre, creerCercle } from '@/lib/cercles';
import { lienAmi, rejoindreParLienAmi } from '@/lib/amis';
import { CASES, grilleDe, reglerGrille, carteCercle, meilleurCreneau, prochainesDates } from '@/lib/kijoukan';

// v4.16.0 — Kijoukan : une semaine type par compte (7 jours × midi / soir), carte d'un cercle.
const id = (r: unknown) => (r as { id: number }).id;
let n = 0;
const compte = () => id(registerUser(`k416_${Date.now().toString(36)}${n++}`.slice(0, 20), '1234'));
const grille = (cases: number[]) => Array.from({ length: CASES }, (_, i) => (cases.includes(i) ? '1' : '0')).join('');

describe('grille', () => {
  test('vide par défaut, réglable, valeurs invalides refusées', () => {
    const a = compte();
    expect(grilleDe(a)).toBe('0'.repeat(CASES));
    expect(reglerGrille(a, grille([3, 10]))).toEqual({ ok: true });
    expect(grilleDe(a)).toBe(grille([3, 10]));
    expect('error' in reglerGrille(a, '1')).toBe(true);
    expect('error' in reglerGrille(a, 'x'.repeat(CASES))).toBe(true);
  });
});

describe('carte du cercle', () => {
  test('somme par case, noms, nombre de membres qui ont répondu ; meilleur créneau', () => {
    const a = compte(); const b = compte(); const c = compte();
    rejoindreParLienAmi(b, lienAmi(a)); rejoindreParLienAmi(c, lienAmi(a));
    const cid = creerCercle(a, 'Joueurs du jeudi').id!;
    ajouterMembre(cid, a, b); ajouterMembre(cid, a, c);
    // case 10 = jeudi soir (jours lundi → dimanche, midi puis soir : soir du jour j = 7 + j)
    reglerGrille(a, grille([10, 5])); reglerGrille(b, grille([10]));
    const carte = carteCercle(cid);
    expect(carte.compte[10]).toBe(2);
    expect(carte.compte[5]).toBe(1);
    expect(carte.noms[10].length).toBe(2);
    expect(carte.repondu).toBe(2);
    expect(carte.membres).toBe(3);
    expect(meilleurCreneau(carte.compte)).toBe(10);
    expect(meilleurCreneau(new Array(CASES).fill(0))).toBeNull();
  });
});

describe('prochaines dates', () => {
  test('les N prochains jours de la semaine visée, à partir de demain', () => {
    const jeudi = 3; // lundi = 0
    const d = prochainesDates(jeudi, 3, '2026-10-07'); // un mercredi
    expect(d).toEqual(['2026-10-08', '2026-10-15', '2026-10-22']);
    expect(prochainesDates(jeudi, 1, '2026-10-08')).toEqual(['2026-10-15']); // jamais aujourd'hui
  });
});
