import { describe, expect, test } from 'vitest';
import { getDb } from '@/lib/db';
import { registerUser } from '@/lib/auth';
import { lienAmi, rejoindreParLienAmi } from '@/lib/amis';
import { createGame } from '@/lib/games';
import { createNight, getNight } from '@/lib/nights';
import {
  creerEvenement, mesEvenements, getEvenement, ajouterJeuProgramme, jeuxProgramme,
  partiesEvenement, rattacher, supprimerEvenement,
} from '@/lib/evenements';

// v4.15.0 — événements : participants (qui voient), jeux au programme, parties rattachées.
const id = (r: unknown) => (r as { id: number }).id;
let n = 0;
const compte = () => id(registerUser(`e415_${Date.now().toString(36)}${n++}`.slice(0, 20), '1234'));
function amis(a: number, b: number) { rejoindreParLienAmi(b, lienAmi(a)); }
const erreur = (r: unknown) => typeof r === 'object' && r !== null && 'error' in r;
const ok = <T,>(r: T | { error: string; status: number }) => { if (r && typeof r === 'object' && 'error' in r) throw new Error(r.error); return r as T; };

function evt(periode = true) {
  const marc = compte(); const julie = compte(); const zoe = compte();
  amis(marc, julie);
  const eid = ok(creerEvenement(marc, {
    titre: 'Marathon campagnes', description: 'On finit Gloomhaven',
    du: periode ? '2026-11-14' : null, au: periode ? '2026-11-15' : null,
  }, [julie, zoe /* pas amie : ignorée */]));
  return { marc, julie, zoe, eid };
}

describe('création et visibilité', () => {
  test('les participants voient l’événement, les autres non ; période facultative', () => {
    const { marc, julie, zoe, eid } = evt();
    expect(mesEvenements(marc).map((e) => e.id)).toContain(eid);
    expect(mesEvenements(julie).map((e) => e.id)).toContain(eid);
    expect(mesEvenements(zoe).map((e) => e.id)).not.toContain(eid);
    expect(getEvenement(eid, zoe)).toBeNull();
    expect(getEvenement(eid, julie)?.participants.map((p) => p.id).sort()).toEqual([marc, julie].sort());
    const sans = evt(false);
    expect(getEvenement(sans.eid, sans.marc)?.du).toBeNull();
  });
  test('validations : titre requis, période complète et ordonnée', () => {
    const marc = compte();
    expect(erreur(creerEvenement(marc, { titre: '  ', description: null, du: null, au: null }, []))).toBe(true);
    expect(erreur(creerEvenement(marc, { titre: 'X', description: null, du: '2026-11-15', au: null }, []))).toBe(true);
    expect(erreur(creerEvenement(marc, { titre: 'X', description: null, du: '2026-11-15', au: '2026-11-14' }, []))).toBe(true);
  });
});

describe('rattachement et programme', () => {
  test('une partie rattachée avec ses seuls joueurs ; le jeu se coche quand elle se termine dessus', () => {
    const { marc, julie, eid } = evt();
    const g = createGame(marc, { title: 'Gloomhaven', box_format: 'grand' });
    ok(ajouterJeuProgramme(eid, marc, g));
    expect(jeuxProgramme(eid).map((j) => [j.title, j.joue])).toEqual([['Gloomhaven', false]]);

    const nid = createNight(marc, [marc]);
    expect(rattacher(nid, marc, eid)).toEqual({ ok: true });
    expect(partiesEvenement(eid).map((p) => [p.id, p.joueurs.map((j) => j.id)])).toEqual([[nid, [marc]]]);

    getDb().prepare("UPDATE nights SET status = 'termine', game_id = ? WHERE id = ?").run(g, nid);
    expect(jeuxProgramme(eid)[0].joue).toBe(true);
    void julie;
  });
  test('gardes : seul le créateur de la partie, participant de l’événement, rattache', () => {
    const { marc, julie, zoe, eid } = evt();
    const nidJulie = createNight(julie, [julie]);
    expect(rattacher(nidJulie, julie, eid)).toEqual({ ok: true }); // une participante rattache SA partie
    const nidMarc = createNight(marc, [marc]);
    expect('error' in rattacher(nidMarc, julie, eid)).toBe(true); // pas sa partie
    const nidZoe = createNight(zoe, [zoe]);
    expect('error' in rattacher(nidZoe, zoe, eid)).toBe(true); // pas participante
    expect(rattacher(nidJulie, julie, null)).toEqual({ ok: true }); // détacher
    expect(getNight(nidJulie)?.evenement_id ?? null).toBeNull();
  });
  test('seul l’organisateur gère le programme', () => {
    const { marc, julie, eid } = evt();
    const g = createGame(julie, { title: 'Azul', box_format: 'moyen' });
    expect('error' in ajouterJeuProgramme(eid, julie, g)).toBe(true);
    void marc;
  });
});

describe('suppression', () => {
  test('les parties restent, détachées ; organisateur seulement', () => {
    const { marc, julie, eid } = evt();
    const nid = createNight(marc, [marc]);
    rattacher(nid, marc, eid);
    expect('error' in supprimerEvenement(eid, julie)).toBe(true);
    expect(supprimerEvenement(eid, marc)).toEqual({ ok: true });
    expect(getNight(nid)).not.toBeNull();
    expect(getNight(nid)?.evenement_id ?? null).toBeNull();
    expect(mesEvenements(marc).map((e) => e.id)).not.toContain(eid);
  });
});
