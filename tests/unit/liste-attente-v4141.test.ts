import { describe, expect, test } from 'vitest';
import { getDb } from '@/lib/db';
import { registerUser } from '@/lib/auth';
import { lienAmi, rejoindreParLienAmi } from '@/lib/amis';
import { createNight, getNightPlayers } from '@/lib/nights';
import { inviter, repondre, listeAttente, mesInvitations } from '@/lib/invitations';
import { creerSerie, occurrencesAVenir } from '@/lib/series';

// v4.14.1 — places max (facultatives) et liste d'attente : la promotion est automatique.
const id = (r: unknown) => (r as { id: number }).id;
let n = 0;
const compte = () => id(registerUser(`l4141_${Date.now().toString(36)}${n++}`.slice(0, 20), '1234'));
const jour = (d: number) => (getDb().prepare("SELECT date('now','localtime', ?) AS d").get(`${d} day`) as { d: string }).d;
function amis(a: number, b: number) { rejoindreParLienAmi(b, lienAmi(a)); }

function partie(places: number | null) {
  const hote = compte(); const a = compte(); const b = compte(); const c = compte();
  for (const x of [a, b, c]) amis(hote, x);
  const nid = createNight(hote, [hote], { playedAt: jour(3), startTime: '20:00', placesMax: places });
  inviter(nid, hote, [a, b, c]);
  return { hote, a, b, c, nid };
}
const joueurs = (nid: number) => getNightPlayers(nid).map((p) => p.id).sort();

describe('liste d’attente', () => {
  test('sans limite : tout le monde joue', () => {
    const { a, b, c, nid } = partie(null);
    for (const x of [a, b, c]) expect(repondre(nid, x, 'dispo')).toEqual({ ok: true });
    expect(getNightPlayers(nid)).toHaveLength(4);
    expect(listeAttente(nid)).toEqual([]);
  });

  test('complet : « Dispo » met en liste, dans l’ordre ; une place libérée promeut le premier', () => {
    const { hote, a, b, c, nid } = partie(2); // l'hôte + 1 place
    expect(repondre(nid, a, 'dispo')).toEqual({ ok: true });
    expect(repondre(nid, b, 'dispo')).toEqual({ ok: true, liste: 1 });
    expect(repondre(nid, c, 'dispo')).toEqual({ ok: true, liste: 2 });
    expect(joueurs(nid)).toEqual([hote, a].sort());
    expect(listeAttente(nid).map((u) => u.id)).toEqual([b, c]);
    expect(mesInvitations(c).find((i) => i.id === nid)?.rang_liste).toBe(2);

    // a se désiste → b joue, c devient 1ᵉʳ
    expect(repondre(nid, a, 'absent')).toEqual({ ok: true });
    expect(joueurs(nid)).toEqual([hote, b].sort());
    expect(listeAttente(nid).map((u) => u.id)).toEqual([c]);
    expect(mesInvitations(c).find((i) => i.id === nid)?.rang_liste).toBe(1);
  });

  test('quitter la liste : « Pas dispo » retire de la liste sans rien promouvoir', () => {
    const { a, b, nid } = partie(2);
    repondre(nid, a, 'dispo'); repondre(nid, b, 'dispo');
    expect(repondre(nid, b, 'absent')).toEqual({ ok: true });
    expect(listeAttente(nid)).toEqual([]);
    expect(getNightPlayers(nid)).toHaveLength(2);
  });

  test('une série reprend la limite sur chaque date', () => {
    const hote = compte(); const a = compte(); amis(hote, a);
    const sid = creerSerie(hote, { playedAt: jour(2), startTime: '20:00', titre: null, pas: 1, placesMax: 6 }, [a]);
    for (const o of occurrencesAVenir(sid)) expect(o.places_max).toBe(6);
  });
});
