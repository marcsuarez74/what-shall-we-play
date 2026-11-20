import { describe, it, expect } from 'vitest';
import { registerUser } from '@/lib/auth';
import { createNight, pasCommencee, drawAllowed } from '@/lib/nights';

// v4.21.4 — avant le jour J (et avant l'heure si elle est renseignée) : ajouter et voter seulement.
const jour = (decalage: number) => { const d = new Date(); d.setDate(d.getDate() + decalage); return d.toLocaleDateString('sv-SE'); };
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
const h = new Date().getHours();

describe('partie pas encore commencée', () => {
  it('demain : pas commencée, avec ou sans heure', () => {
    expect(pasCommencee({ played_at: jour(1) })).toBe(true);
    expect(pasCommencee({ played_at: jour(1), start_time: '00:00' })).toBe(true);
  });
  it('aujourd hui sans heure, ou heure passée : commencée', () => {
    expect(pasCommencee({ played_at: jour(0) })).toBe(false);
    expect(pasCommencee({ played_at: jour(0), start_time: '00:00' })).toBe(false);
    expect(pasCommencee({ played_at: jour(-1), start_time: '23:59' })).toBe(false);
  });
  it.skipIf(h >= 23)('aujourd hui avant l heure : pas commencée, le tirage est refusé', () => {
    expect(pasCommencee({ played_at: jour(0), start_time: hh(h + 1) })).toBe(true);
    const u = (registerUser('pc_marc', '1234') as { id: number }).id;
    const n = createNight(u, [u], { playedAt: jour(0), startTime: hh(h + 1) });
    expect(drawAllowed(n)).toMatchObject({ status: 409 });
  });
});
