import { describe, expect, test } from 'vitest';
import { getDb } from '@/lib/db';
import { registerUser } from '@/lib/auth';
import { lienAmi, rejoindreParLienAmi } from '@/lib/amis';
import { createGame } from '@/lib/games';
import { addNightGame, conflitHoraire, createNight, getNight, getNightPlayers } from '@/lib/nights';
import { invitesNuit, repondre } from '@/lib/invitations';
import { ajouterJours, arreterSerie, AVANCE, completerSeries, creerSerie, dispoATous, mesSeries, modifierSerie, occurrencesAVenir } from '@/lib/series';

// v4.14.0 — parties récurrentes : 4 dates d'avance, complétées au fil de l'eau ; conflit ±3 h.
const id = (r: unknown) => (r as { id: number }).id;
let n = 0;
const compte = () => id(registerUser(`s414_${Date.now().toString(36)}${n++}`.slice(0, 20), '1234'));
const jour = (d: number) => (getDb().prepare("SELECT date('now','localtime', ?) AS d").get(`${d} day`) as { d: string }).d;
function amis(a: number, b: number) { rejoindreParLienAmi(b, lienAmi(a)); }

function serie(pas: 1 | 2 = 1) {
  const hote = compte(); const tom = compte();
  amis(hote, tom);
  const sid = creerSerie(hote, { playedAt: jour(2), startTime: '20:00', titre: 'Jeudi jeux', pas }, [tom]);
  return { hote, tom, sid };
}

describe('ajouterJours', () => {
  test('arithmétique calendaire, changement de mois et d’année', () => {
    expect(ajouterJours('2026-12-29', 7)).toBe('2027-01-05');
    expect(ajouterJours('2026-02-25', 7)).toBe('2026-03-04');
  });
});

describe('création', () => {
  test('4 dates d’avance, même heure et titre, une semaine d’écart, invités sur chacune', () => {
    const { hote, tom, sid } = serie();
    const occ = occurrencesAVenir(sid);
    expect(occ).toHaveLength(AVANCE);
    expect(occ.map((o) => o.played_at)).toEqual([jour(2), jour(9), jour(16), jour(23)]);
    for (const o of occ) {
      expect(o.start_time).toBe('20:00');
      expect(o.titre).toBe('Jeudi jeux');
      expect(o.creator_id).toBe(hote);
      expect(invitesNuit(o.id).map((i) => i.id)).toEqual([tom]);
    }
  });
  test('toutes les 2 semaines', () => {
    const { sid } = serie(2);
    expect(occurrencesAVenir(sid).map((o) => o.played_at)).toEqual([jour(2), jour(16), jour(30), jour(44)]);
  });
});

describe('complétion paresseuse', () => {
  test('une partie jouée → la date suivante est créée, avec les mêmes invités', () => {
    const { tom, sid } = serie();
    const premiere = occurrencesAVenir(sid)[0];
    getDb().prepare("UPDATE nights SET status = 'termine' WHERE id = ?").run(premiere.id);
    expect(completerSeries()).toBeGreaterThanOrEqual(1);
    const occ = occurrencesAVenir(sid);
    expect(occ).toHaveLength(AVANCE);
    expect(occ[AVANCE - 1].played_at).toBe(jour(30));
    expect(invitesNuit(occ[AVANCE - 1].id).map((i) => i.id)).toEqual([tom]);
    expect(completerSeries()).toBe(0); // idempotent
  });
});

describe('réponses', () => {
  test('Dispo à toutes : joueur de chaque date à venir', () => {
    const { tom, sid } = serie();
    expect(dispoATous(sid, tom)).toEqual({ ok: true });
    for (const o of occurrencesAVenir(sid)) expect(getNightPlayers(o.id).map((p) => p.id)).toContain(tom);
  });
  test('mesSeries : la série apparaît chez l’hôte et l’invité, avec l’état par date', () => {
    const { hote, tom, sid } = serie();
    const occ = occurrencesAVenir(sid);
    repondre(occ[1].id, tom, 'dispo');
    const chezTom = mesSeries(tom).find((s) => s.id === sid)!;
    expect(chezTom.dates.map((d) => d.etat)).toEqual(['attente', 'dispo', 'attente', 'attente']);
    const chezHote = mesSeries(hote).find((s) => s.id === sid)!;
    expect(chezHote.dates.every((d) => d.etat === 'createur')).toBe(true);
  });
});

describe('gestion', () => {
  test('modifier la série : titre et heure de toutes les dates à venir ; créateur seulement', () => {
    const { hote, tom, sid } = serie();
    const r = modifierSerie(sid, tom, { startTime: '19:00' });
    expect('error' in r && r.status).toBe(403);
    expect(modifierSerie(sid, hote, { titre: 'Mardi jeux', startTime: '19:00' })).toEqual({ ok: true });
    for (const o of occurrencesAVenir(sid)) { expect(o.titre).toBe('Mardi jeux'); expect(o.start_time).toBe('19:00'); }
  });
  test('arrêter : dates vierges supprimées, étagère préparée gardée (partie ordinaire), plus de complétion', () => {
    const { hote, tom, sid } = serie();
    const occ = occurrencesAVenir(sid);
    const g = createGame(hote, { title: 'Azul', box_format: 'moyen' });
    addNightGame(occ[2].id, g, hote);
    expect('error' in arreterSerie(sid, tom)).toBe(true);
    expect(arreterSerie(sid, hote)).toEqual({ ok: true, supprimees: 3, gardees: 1 });
    expect(getNight(occ[0].id)).toBeNull();
    expect(getNight(occ[2].id)?.serie_id ?? null).toBeNull(); // gardée, détachée
    expect(completerSeries()).toBe(0);
    expect(mesSeries(hote).find((s) => s.id === sid)).toBeUndefined();
  });
});

describe('conflit d’horaire', () => {
  test('même jour à ±3 h, ou sans heure ; jamais une partie terminée', () => {
    const a = compte();
    const n1 = createNight(a, [a], { playedAt: jour(5), startTime: '19:30', titre: 'Soirée Léa' });
    const n2 = createNight(a, [a], { playedAt: jour(5), startTime: '21:00' });
    const n3 = createNight(a, [a], { playedAt: jour(5), startTime: '23:45' });
    const n4 = createNight(a, [a], { playedAt: jour(6), startTime: null });
    const n5 = createNight(a, [a], { playedAt: jour(6), startTime: '14:00' });
    expect(conflitHoraire(a, getNight(n2)!)?.id).toBe(n1);
    expect(conflitHoraire(a, getNight(n3)!)?.id).toBe(n2); // 2 h 45 d'écart
    expect(conflitHoraire(a, getNight(n1)!)?.id).toBe(n2);
    expect(conflitHoraire(a, getNight(n5)!)?.id).toBe(n4); // sans heure : même jour = conflit
    getDb().prepare("UPDATE nights SET status = 'termine' WHERE id = ?").run(n4);
    expect(conflitHoraire(a, getNight(n5)!)).toBeNull();
  });
});
