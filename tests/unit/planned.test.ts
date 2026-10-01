import { describe, it, expect } from 'vitest';
import { registerUser } from '@/lib/auth';
import { createNight, getActiveNight, getPlannedNights, getShelfGames, getNight, endNight, getMyNights } from '@/lib/nights';
import { createGame } from '@/lib/games';
import { getDb } from '@/lib/db';

const uid = (p: string) => (registerUser(p, '1234') as { id: number }).id;
// YYYY-MM-DD local (sv-SE), demain par arithmétique calendaire (sûr pendant le DST)
const demain = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('sv-SE');
};

describe('soirées programmées', () => {
  it('programmée demain : ni active ni visible aujourd hui, mais dans Programmées des deux participants', () => {
    const marc = uid('p-marc');
    const lea = uid('p-lea');
    const g = createGame(marc, { title: 'Demain', box_format: 'petit' });
    const n = createNight(marc, [marc, lea], { playedAt: demain(), startTime: '20:00' });
    expect(getActiveNight(marc)).toBeNull(); // pas de soirée aujourd hui
    expect(getActiveNight(lea)).toBeNull();
    expect(getShelfGames(n).map((x) => x.id)).toEqual([g]); // l étagère de CETTE nuit est prête pour le jour J
    expect(getPlannedNights(marc).map((x) => x.id)).toContain(n);
    expect(getPlannedNights(lea).map((x) => x.id)).toContain(n); // simple joueur la voit aussi
  });

  it('reprogrammée aujourd hui : elle DEVIENT la nuit active (jour J automatique)', () => {
    const thib = uid('p-thib');
    const n = createNight(thib, [thib], { playedAt: demain() });
    expect(getActiveNight(thib)).toBeNull();
    getDb().prepare("UPDATE nights SET played_at = date('now','localtime') WHERE id = ?").run(n);
    expect(getActiveNight(thib)?.id).toBe(n); // aucun état à muter
  });

  it('getActiveNight : un simple participant voit la nuit du jour même sans en être créateur', () => {
    const marc = uid('p-host');
    const lea = uid('p-guest');
    const n = createNight(marc, [marc, lea]);
    expect(getActiveNight(lea)?.id).toBe(n);
  });

  it('start_time est persisté', () => {
    const marc = uid('p-heure');
    const n = createNight(marc, [marc], { startTime: '20:30' });
    expect(getNight(n)?.start_time).toBe('20:30');
  });

  it('terminer la nuit la sort de l état actif et la garde en historique', () => {
    const marc = uid('p-fin');
    const n = createNight(marc, [marc]);
    expect(getActiveNight(marc)?.id).toBe(n);
    endNight(n);
    expect(getActiveNight(marc)).toBeNull(); // plus de soirée en cours
    expect(getMyNights(marc).map((x) => x.id)).toContain(n); // l historique conserve la nuit
    expect(getNight(n)?.ended_at).not.toBeNull();
  });
});
