import { describe, expect, test } from 'vitest';
import { getDb } from '@/lib/db';
import { registerUser } from '@/lib/auth';
import { lienAmi, rejoindreParLienAmi } from '@/lib/amis';
import { creerSondage, repondreSondage, sondagesInvite, sondagesOrganises, nbSondagesSansReponse, retenirDates, supprimerSondage } from '@/lib/sondages';
import { getNight, getNightPlayers } from '@/lib/nights';
import { invitesNuit } from '@/lib/invitations';

// v4.10.0 — sondage de dates : proposer, répondre, retenir un ou plusieurs soirs.
const id = (r: unknown) => (r as { id: number }).id;
let n = 0;
const compte = () => id(registerUser(`s410_${Date.now().toString(36)}${n++}`.slice(0, 20), '1234'));
const jour = (d: number) => (getDb().prepare("SELECT date('now','localtime', ?) AS d").get(`${d} day`) as { d: string }).d;
function amis(a: number, b: number) { rejoindreParLienAmi(b, lienAmi(a)); }

function sondage() {
  const hote = compte(); const tom = compte(); const julie = compte(); const leo = compte();
  for (const x of [tom, julie, leo]) amis(hote, x);
  const r = creerSondage(hote, {
    titre: 'Soirée Azul', playerIds: [tom, julie, leo],
    dates: [{ playedAt: jour(3), startTime: '20:30' }, { playedAt: jour(4), startTime: null }, { playedAt: jour(9) }],
  });
  if (!('id' in r) || !r.id) throw new Error('sondage attendu');
  const dates = sondagesOrganises(hote).find((s) => s.id === r.id)!.dates;
  return { hote, tom, julie, leo, sid: r.id, dates };
}

describe('création', () => {
  test('2 à 6 dates valides, distinctes, au moins un invité de mes relations', () => {
    const hote = compte(); const ami = compte(); const inconnu = compte();
    amis(hote, ami);
    const une = [{ playedAt: jour(2) }];
    expect(creerSondage(hote, { dates: une, playerIds: [ami] })).toMatchObject({ status: 400 });
    expect(creerSondage(hote, { dates: Array.from({ length: 7 }, (_, i) => ({ playedAt: jour(i + 1) })), playerIds: [ami] })).toMatchObject({ status: 400 });
    expect(creerSondage(hote, { dates: [{ playedAt: jour(2) }, { playedAt: jour(2) }], playerIds: [ami] })).toMatchObject({ status: 400 });
    expect(creerSondage(hote, { dates: [{ playedAt: jour(-1) }, { playedAt: jour(2) }], playerIds: [ami] })).toMatchObject({ status: 400 });
    expect(creerSondage(hote, { dates: [{ playedAt: jour(2) }, { playedAt: jour(3) }], playerIds: [inconnu] })).toMatchObject({ status: 400 });
    const ok = creerSondage(hote, { dates: [{ playedAt: jour(3) }, { playedAt: jour(2) }], playerIds: [ami, inconnu] }) as { id: number };
    const s = sondagesInvite(ami).find((x) => x.id === ok.id)!;
    expect(s.invites.map((i) => i.id)).toEqual([ami]); // l'inconnu est écarté
    expect(s.dates.map((d) => d.played_at)).toEqual([jour(2), jour(3)]); // triées
  });
});

describe('réponses', () => {
  test('première réponse : toutes les dates notées, une seule dispo ; bascule ; pastille', () => {
    const { tom, sid, dates } = sondage();
    expect(nbSondagesSansReponse(tom)).toBeGreaterThanOrEqual(1);
    const avant = nbSondagesSansReponse(tom);
    expect(repondreSondage(sid, tom, dates[0].id, true)).toEqual({ ok: true });
    expect(nbSondagesSansReponse(tom)).toBe(avant - 1);
    let s = sondagesInvite(tom).find((x) => x.id === sid)!;
    expect(s.mesDispos).toEqual([dates[0].id]);
    expect(s.invites.find((i) => i.id === tom)!.repondu).toBe(true);
    repondreSondage(sid, tom, dates[0].id, false);
    s = sondagesInvite(tom).find((x) => x.id === sid)!;
    expect(s.mesDispos).toEqual([]);
    expect(s.invites.find((i) => i.id === tom)!.repondu).toBe(true); // « aucune date » reste une réponse
  });

  test('réponses visibles de tous ; l’organisateur dispo partout ; un non-invité ne répond pas', () => {
    const { hote, tom, julie, sid, dates } = sondage();
    repondreSondage(sid, tom, dates[1].id, true);
    const vuParJulie = sondagesInvite(julie).find((x) => x.id === sid)!;
    expect(vuParJulie.dates[1].dispos.map((u) => u.id)).toEqual(expect.arrayContaining([hote, tom]));
    expect(vuParJulie.dates[0].dispos.map((u) => u.id)).toEqual([hote]);
    expect(repondreSondage(sid, compte(), dates[0].id, true)).toMatchObject({ status: 404 });
    expect(repondreSondage(sid, tom, 999999, true)).toMatchObject({ status: 404 });
    expect(repondreSondage(sid, tom, dates[0].id, 'oui')).toMatchObject({ status: 400 });
  });
});

describe('retenir', () => {
  test('deux soirs : une partie par soir ; dispo joueurs, non → Pas dispo, sans réponse → attente ; sondage fermé', () => {
    const { hote, tom, julie, leo, sid, dates } = sondage();
    repondreSondage(sid, tom, dates[0].id, true);
    repondreSondage(sid, julie, dates[0].id, true);
    repondreSondage(sid, julie, dates[1].id, true);
    expect(retenirDates(sid, tom, [dates[0].id])).toMatchObject({ status: 403 });
    expect(retenirDates(sid, hote, [])).toMatchObject({ status: 400 });
    const r = retenirDates(sid, hote, [dates[0].id, dates[1].id]) as { nightIds: number[] };
    expect(r.nightIds).toHaveLength(2);
    const [v, s] = r.nightIds;
    expect(getNight(v)).toMatchObject({ played_at: jour(3), start_time: '20:30', titre: 'Soirée Azul' });
    expect(getNightPlayers(v).map((p) => p.id).sort()).toEqual([hote, tom, julie].sort());
    expect(getNightPlayers(s).map((p) => p.id).sort()).toEqual([hote, julie].sort());
    const etats = (nid: number) => Object.fromEntries(invitesNuit(nid).map((i) => [i.id, i.etat]));
    expect(etats(v)).toEqual({ [tom]: 'dispo', [julie]: 'dispo', [leo]: 'attente' });
    expect(etats(s)).toEqual({ [tom]: 'absent', [julie]: 'dispo', [leo]: 'attente' });
    expect(sondagesOrganises(hote).some((x) => x.id === sid)).toBe(false);
    expect(sondagesInvite(tom).some((x) => x.id === sid)).toBe(false);
  });

  test('supprimer : organisateur seulement, aucune partie créée', () => {
    const { hote, tom, sid } = sondage();
    const avant = (getDb().prepare('SELECT COUNT(*) AS c FROM nights WHERE creator_id = ?').get(hote) as { c: number }).c;
    expect(supprimerSondage(sid, tom)).toMatchObject({ status: 403 });
    expect(supprimerSondage(sid, hote)).toEqual({ ok: true });
    expect(sondagesOrganises(hote)).toEqual([]);
    expect((getDb().prepare('SELECT COUNT(*) AS c FROM nights WHERE creator_id = ?').get(hote) as { c: number }).c).toBe(avant);
  });
});
