import { describe, it, expect } from 'vitest';
import { registerUser } from '@/lib/auth';
import { createGame, deleteGame } from '@/lib/games';
import {
  createNight, addNightGame, removeNightGame, toggleNightVeto, boxOutNight, drawAllowed, endNight, getNight,
} from '@/lib/nights';
import { declarerManche, retirerDeclaration, getNightPlays, changerMode } from '@/lib/libre';
import { classerManche, podiumPartie } from '@/lib/manches';

const uid = (p: string) => (registerUser(p, '1234') as { id: number }).id;
const statut = (r: { ok: true } | { error: string; status: number }) => ('error' in r ? r.status : 'ok');

function partieLibre(prefixe: string) {
  const marc = uid(`${prefixe}_marc`); const lea = uid(`${prefixe}_lea`);
  const g = createGame(marc, { title: `Azul ${prefixe}`, box_format: 'moyen' });
  const n = createNight(marc, [marc, lea], { mode: 'libre' });
  addNightGame(n, g, marc);
  return { marc, lea, g, n };
}

describe('choix libre — déclarer une manche (v4.19.0)', () => {
  it('mode par défaut tirage ; libre stocké', () => {
    const a = uid('lm_a');
    expect(getNight(createNight(a, [a]))!.mode).toBe('tirage');
    expect(getNight(createNight(a, [a], { mode: 'libre' }))!.mode).toBe('libre');
  });

  it('déclarer, modifier (upsert), retirer — seulement sa ligne', () => {
    const { marc, lea, g, n } = partieLibre('ld');
    expect(declarerManche(n, marc, g, 1, 42)).toEqual({ ok: true });
    expect(declarerManche(n, lea, g, 1, null)).toEqual({ ok: true });
    expect(declarerManche(n, marc, g, 1, 50)).toEqual({ ok: true });
    expect(getNightPlays(n).map((p) => [p.user_id, p.manche, p.score])).toEqual([[marc, 1, 50], [lea, 1, null]]);
    expect(retirerDeclaration(n, lea, g, 1)).toEqual({ ok: true });
    expect(getNightPlays(n).map((p) => p.user_id)).toEqual([marc]);
  });

  it('nouvelle manche bornée à dernière + 1 ; même jeu rejoué', () => {
    const { marc, g, n } = partieLibre('lb');
    expect(statut(declarerManche(n, marc, g, 2, 1))).toBe(400);
    expect(statut(declarerManche(n, marc, g, 0, 1))).toBe(400);
    expect(statut(declarerManche(n, marc, g, 1.5, 1))).toBe(400);
    expect(declarerManche(n, marc, g, 1, 10)).toEqual({ ok: true });
    expect(declarerManche(n, marc, g, 2, 20)).toEqual({ ok: true });
    expect(getNightPlays(n)).toHaveLength(2);
  });

  it('gardes : mode tirage, non participant, hors étagère, veto, score, terminée', () => {
    const { marc, lea, g, n } = partieLibre('lg');
    const intrus = uid('lg_intrus');
    const h = createGame(marc, { title: 'Hors étagère lg', box_format: 'petit' });
    expect(statut(declarerManche(n, intrus, g, 1, 1))).toBe(403);
    expect(statut(declarerManche(n, marc, h, 1, 1))).toBe(400);
    expect(statut(declarerManche(n, marc, g, 1, Number.NaN))).toBe(400);
    const v = createGame(marc, { title: 'Vetoé lg', box_format: 'petit' });
    addNightGame(n, v, marc);
    expect(toggleNightVeto(n, v, lea)).toEqual({ ok: true });
    expect(statut(declarerManche(n, marc, v, 1, 1))).toBe(409);
    const t = createNight(marc, [marc]); addNightGame(t, g, marc);
    expect(statut(declarerManche(t, marc, g, 1, 1))).toBe(409);
    expect(endNight(n, marc)).toEqual({ ok: true });
    expect(statut(declarerManche(n, marc, g, 1, 1))).toBe(409);
    expect(statut(retirerDeclaration(n, marc, g, 1))).toBe(409);
  });

  it('jeu joué : plus de veto, plus de retrait d’étagère, plus de suppression', () => {
    const { marc, lea, g, n } = partieLibre('lj');
    declarerManche(n, marc, g, 1, null);
    expect(statut(toggleNightVeto(n, g, lea))).toBe(409);
    expect(statut(removeNightGame(n, g, marc))).toBe(409);
    expect(statut(deleteGame(marc, g))).toBe(409);
  });

  it('pas de tirage en choix libre', () => {
    const { marc, g, n } = partieLibre('lt');
    expect(statut(drawAllowed(n))).toBe(409);
    expect(statut(boxOutNight(n, marc, g))).toBe(409);
  });

  it('terminer en libre ignore les scores globaux', () => {
    const { marc, n } = partieLibre('le');
    expect(endNight(n, marc, { [marc]: 12 })).toEqual({ ok: true });
    expect(getNight(n)!.status).toBe('termine');
  });

  it('changer de mode : créateur, sans déclaration', () => {
    const { marc, lea, g, n } = partieLibre('lc');
    expect(statut(changerMode(n, lea, 'tirage'))).toBe(403);
    expect(statut(changerMode(n, marc, 'autre'))).toBe(400);
    expect(changerMode(n, marc, 'tirage')).toEqual({ ok: true });
    expect(changerMode(n, marc, 'libre')).toEqual({ ok: true });
    declarerManche(n, marc, g, 1, 3);
    expect(statut(changerMode(n, marc, 'tirage'))).toBe(409);
    expect(changerMode(n, marc, 'libre')).toEqual({ ok: true }); // inchangé : pas d'erreur
  });
});

describe('classement et podium (fonctions pures)', () => {
  const l = (game_id: number, manche: number, user_id: number, score: number | null) => ({ game_id, manche, user_id, score });

  it('égalité partagée, sans score hors classement', () => {
    const r = classerManche([l(1, 1, 1, 10), l(1, 1, 2, 10), l(1, 1, 3, 4), l(1, 1, 4, null)]);
    expect(r.gagnants).toEqual([1, 2]);
    expect(r.classes.map((c) => [c.user_id, c.rank])).toEqual([[1, 1], [2, 1], [3, 2]]);
    expect(r.sansScore.map((s) => s.user_id)).toEqual([4]);
  });

  it('podium de la partie : manches gagnées, rang dense, coop sans gagnant', () => {
    const p = podiumPartie([
      l(1, 1, 1, 10), l(1, 1, 2, 5),
      l(1, 2, 1, 3), l(1, 2, 2, 8),
      l(2, 1, 1, 7), l(2, 1, 2, 7), l(2, 1, 3, 1),
      l(3, 1, 1, null), l(3, 1, 2, null),
    ]);
    expect(p.map((x) => [x.user_id, x.victoires, x.rank])).toEqual([[1, 2, 1], [2, 2, 1]]);
  });
});
