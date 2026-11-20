import { describe, it, expect } from 'vitest';
import { registerUser } from '@/lib/auth';
import { createNight, getAVenir, joursAvant } from '@/lib/nights';
import { creerSerie } from '@/lib/series';

// v4.21.0 — Parties à venir sur l'étagère.
const uid = (p: string) => (registerUser(`${p}_${Date.now().toString(36)}`, '1234') as { id: number }).id;
// YYYY-MM-DD local dans n jours — arithmétique calendaire (sûr pendant le DST).
const jour = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv-SE');
};

describe('parties à venir (v4.21.0)', () => {
  it('getAVenir : futures seulement, la plus proche d abord, sans les dates de série', () => {
    const marc = uid('av_marc');
    const loin = createNight(marc, [marc], { playedAt: jour(9), titre: 'Loin' });
    const proche = createNight(marc, [marc], { playedAt: jour(1), titre: 'Proche' });
    createNight(marc, [marc]); // aujourd'hui : partie du jour, pas « à venir »
    creerSerie(marc, { playedAt: jour(3), startTime: null, titre: 'Série', pas: 1 }, []);
    expect(getAVenir(marc).map((n) => n.id)).toEqual([proche, loin]);
  });

  it('getAVenir : un joueur la voit, un autre compte non', () => {
    const hote = uid('av_hote');
    const joueur = uid('av_joueur');
    const autre = uid('av_autre');
    const n = createNight(hote, [hote, joueur], { playedAt: jour(2) });
    expect(getAVenir(joueur).map((x) => x.id)).toContain(n);
    expect(getAVenir(autre)).toEqual([]);
  });

  it('joursAvant : demain = 1, dans 6 jours = 6', () => {
    expect(joursAvant(jour(1))).toBe(1);
    expect(joursAvant(jour(6))).toBe(6);
  });
});
