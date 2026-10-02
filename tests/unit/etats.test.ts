import { describe, it, expect } from 'vitest';
import { registerUser } from '@/lib/auth';
import { createGame } from '@/lib/games';
import { createNight, boxOutNight, endNight, drawAllowed, getNight, getNightScores, getHistoryCards, getTodayTermineeNight, getNightGame, addNightGame, getActiveNight } from '@/lib/nights';
import { getDb } from '@/lib/db';

const uid = (p: string) => (registerUser(p, '1234') as { id: number }).id;

describe('états de partie', () => {
  it('sortir la boîte : création → en_jeu, jeu verrouillé, tirage refusé ensuite', () => {
    const marc = uid('e-marc'); const lea = uid('e-lea');
    const g = createGame(marc, { title: 'Cascadia', box_format: 'moyen' });
    const n = createNight(marc, [marc, lea]);
    addNightGame(n, g, marc);
    expect(drawAllowed(n)).toEqual({ ok: true });
    expect(boxOutNight(n, lea, g)).toEqual({ ok: true }); // un INVITÉ peut sortir la boîte
    const night = getNight(n)!;
    expect(night.status).toBe('en_jeu');
    expect(night.game_id).toBe(g);
    expect(drawAllowed(n)).toEqual({ error: 'La boîte est sortie — le jeu est verrouillé', status: 409 });
    expect(boxOutNight(n, marc, g)).toEqual({ error: 'La boîte est déjà sortie', status: 409 });
  });
  it('refuse une boîte hors étagère, un hors-la-soirée, et le tirage sur une partie terminée', () => {
    const marc = uid('e-m2'); const lea = uid('e-l2'); const zoe = uid('e-z2');
    const g = createGame(marc, { title: 'Azul', box_format: 'petit' });
    const n = createNight(marc, [marc, lea]);
    expect(boxOutNight(n, marc, g)).toEqual({ error: "Ce jeu n'est pas sur l'étagère", status: 400 });
    const rZoe = boxOutNight(n, zoe, g);
    expect('error' in rZoe && rZoe.status).toBe(403);
    addNightGame(n, g, marc);
    endNight(n, marc);
    expect(boxOutNight(n, marc, g)).toEqual({ error: 'Cette partie est terminée', status: 409 });
    expect(drawAllowed(n)).toEqual({ error: 'Cette partie est terminée', status: 409 });
  });
  it('terminer : créateur seulement, scores atomiques, double end refusé', () => {
    const marc = uid('e-m3'); const lea = uid('e-l3'); const zoe = uid('e-z3');
    const n = createNight(marc, [marc, lea]);
    const rLea = endNight(n, lea);
    expect('error' in rLea && rLea.status).toBe(403); // pas le créateur
    expect(endNight(n, marc, { [marc]: 24, [lea]: 19 })).toEqual({ ok: true });
    const rDouble = endNight(n, marc);
    expect('error' in rDouble && rDouble.status).toBe(409); // double end
    expect(getNightScores(n).map((r) => r.score)).toEqual([24, 19]);
  });
  it('scores invalides : rejet 400 ET la partie reste en_jeu (rien de semi-enregistré)', () => {
    const marc = uid('e-m4'); const lea = uid('e-l4');
    const g = createGame(marc, { title: 'Harmonies', box_format: 'petit' });
    const n = createNight(marc, [marc, lea]);
    addNightGame(n, g, marc);
    boxOutNight(n, marc, g);
    const rNaN = endNight(n, marc, { [marc]: Number.NaN });
    expect('error' in rNaN && rNaN.status).toBe(400);
    const rHors = endNight(n, marc, { [999999]: 5 });
    expect('error' in rHors && rHors.status).toBe(400); // id hors soirée : personne ne joue ici
    expect(getNight(n)!.status).toBe('en_jeu');
    expect(getNightScores(n)).toHaveLength(0);
  });
  it('terminer sans scores = aucune ligne ; depuis creation = abandon', () => {
    const marc = uid('e-m5'); const lea = uid('e-l5');
    const n = createNight(marc, [marc, lea]);
    endNight(n, marc); // abandon depuis creation
    expect(getNight(n)!.status).toBe('termine');
    expect(getNightScores(n)).toHaveLength(0);
  });
  it('lectures : getNightGame, historique avec gagnant, soirée du jour terminée, active exclut termine', () => {
    const marc = uid('e-m6'); const lea = uid('e-l6');
    const g = createGame(marc, { title: 'Terraforming Mars', box_format: 'grand' });
    const n = createNight(marc, [marc, lea]);
    addNightGame(n, g, marc);
    boxOutNight(n, marc, g);
    endNight(n, marc, { [marc]: 81, [lea]: 88 });
    expect(getNightGame(n)!.title).toBe('Terraforming Mars');
    const card = getHistoryCards(marc).find((c) => c.id === n)!;
    expect(card.gagnant_pseudo).toBe('e-l6');
    expect(card.gagnant_score).toBe(88);
    expect(card.game_title).toBe('Terraforming Mars');
    expect(getActiveNight(marc)).toBeNull(); // terminée → plus active
    const duJour = getTodayTermineeNight(marc);
    expect(duJour?.id).toBe(n);
    expect(duJour?.game_title).toBe('Terraforming Mars');
  });
  it('historique : carte sans scores ni gagnant (soirée migrée)', () => {
    const marc = uid('e-m7');
    const n = createNight(marc, [marc]);
    getDb().prepare(`UPDATE nights SET played_at = date('now','-1 day'), status='termine', ended_at=datetime('now','localtime') WHERE id=?`).run(n);
    const card = getHistoryCards(marc).find((c) => c.id === n)!;
    expect(card.gagnant_pseudo).toBeNull();
    expect(card.game_title).toBeNull();
  });
});
