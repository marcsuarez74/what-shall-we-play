import { describe, it, expect } from 'vitest';
import { registerUser } from '@/lib/auth';
import { createGame } from '@/lib/games';
import { getDb } from '@/lib/db';
import { createNight, addNightGame, boxOutNight, endNight } from '@/lib/nights';
import { poserVerdict, verdictsDeNuit, monVerdict, type Verdict } from '@/lib/verdicts';

const uid = (p: string) => (registerUser(p, '1234') as { id: number }).id;

// Soirée terminée avec sa boîte sortie : le seul état où un verdict se donne.
function soireeJouee(pseudo: string, titre: string) {
  const hote = uid(pseudo);
  const jeu = createGame(hote, { title: titre, box_format: 'moyen' });
  const n = createNight(hote, [hote]);
  addNightGame(n, jeu, hote);
  boxOutNight(n, hote, jeu);
  endNight(n, hote);
  return { hote, jeu, n };
}

describe('poserVerdict', () => {
  it('poser puis re-voter : remplace (une ligne par joueur), lisible via monVerdict/verdictsDeNuit', () => {
    const { hote, n } = soireeJouee('vd-revote', 'Cascadia');
    expect(monVerdict(n, hote)).toBeNull(); // rien posé
    expect(poserVerdict(n, hote, 'adore')).toEqual({ ok: true });
    expect(monVerdict(n, hote)).toBe('adore');
    expect(verdictsDeNuit(n)).toEqual({ adore: 1, bien: 0, neutre: 0 });

    expect(poserVerdict(n, hote, 'bien')).toEqual({ ok: true }); // révocable, comme le vote étagère
    expect(monVerdict(n, hote)).toBe('bien');
    expect(verdictsDeNuit(n)).toEqual({ adore: 0, bien: 1, neutre: 0 }); // l'adore a disparu
    const lignes = getDb().prepare('SELECT COUNT(*) AS t FROM night_verdicts WHERE night_id = ?').get(n) as { t: number };
    expect(lignes.t).toBe(1); // remplacé, pas dupliqué
  });

  it('game_id copié de nights.game_id au moment du vote, rafraîchi à chaque re-vote', () => {
    const hote = uid('vd-gid');
    const azul = createGame(hote, { title: 'Azul', box_format: 'petit' });
    const n = createNight(hote, [hote]);
    addNightGame(n, azul, hote);
    boxOutNight(n, hote, azul);
    endNight(n, hote);
    expect(poserVerdict(n, hote, 'adore')).toEqual({ ok: true });
    const copie = () => getDb().prepare('SELECT game_id FROM night_verdicts WHERE night_id = ? AND user_id = ?').get(n, hote) as { game_id: number };
    expect(copie().game_id).toBe(azul); // la boîte jouée au moment du vote

    // la boîte de la nuit change ensuite : le re-vote rafraîchit la copie (agrégats sans jointure)
    const harmonies = createGame(hote, { title: 'Harmonies', box_format: 'moyen' });
    getDb().prepare('UPDATE nights SET game_id = ? WHERE id = ?').run(harmonies, n);
    expect(poserVerdict(n, hote, 'bien')).toEqual({ ok: true });
    expect(copie().game_id).toBe(harmonies);
  });

  it('gardes : partie inconnue 404, non-participant 403, en_jeu 409, création 409, sans boîte 409', () => {
    const { hote, n } = soireeJouee('vd-garde', 'Wingspan');
    const zarb = uid('vd-zarb');
    expect(poserVerdict(99999, hote, 'adore')).toEqual({ error: 'Partie introuvable', status: 404 });
    expect(poserVerdict(n, zarb, 'adore')).toEqual({ error: 'Seuls les joueurs de la partie peuvent donner leur verdict', status: 403 });

    // en_jeu : la boîte est sortie mais la soirée n'est pas terminée
    const jeuEnCours = createGame(hote, { title: 'Azul', box_format: 'petit' });
    const enCours = createNight(hote, [hote]);
    addNightGame(enCours, jeuEnCours, hote);
    boxOutNight(enCours, hote, jeuEnCours);
    expect(poserVerdict(enCours, hote, 'adore')).toEqual({ error: 'La partie est en cours — le verdict se donne après', status: 409 });

    // création : la soirée n'a pas encore commencé
    const vierge = uid('vd-vierge');
    const pasCommencee = createNight(vierge, [vierge]);
    expect(poserVerdict(pasCommencee, vierge, 'bien')).toEqual({ error: 'La soirée n’a pas encore commencé', status: 409 });

    // terminée sans boîte (abandon depuis création) : rien à juger
    const abandonneur = uid('vd-abandon');
    const abandon = createNight(abandonneur, [abandonneur]);
    endNight(abandon, abandonneur);
    expect(poserVerdict(abandon, abandonneur, 'neutre')).toEqual({ error: 'Aucune boîte à juger', status: 409 });
  });

  it('verdict invalide (hors adore/bien/neutre) : 400, rien enregistré', () => {
    const { hote, n } = soireeJouee('vd-invalide', '7 Wonders');
    expect(poserVerdict(n, hote, 'bof' as Verdict)).toEqual({ error: 'Verdict invalide', status: 400 });
    expect(monVerdict(n, hote)).toBeNull();
  });

  it('verdictsDeNuit agrège les verdicts de plusieurs joueurs', () => {
    const hote = uid('vd-agreg');
    const invite = uid('vd-aggi');
    const g = createGame(hote, { title: 'Harmonies', box_format: 'moyen' });
    const n = createNight(hote, [hote, invite]);
    addNightGame(n, g, hote);
    boxOutNight(n, hote, g);
    endNight(n, hote, { [hote]: 42, [invite]: 35 });
    expect(poserVerdict(n, hote, 'adore')).toEqual({ ok: true });
    expect(poserVerdict(n, invite, 'neutre')).toEqual({ ok: true });
    expect(verdictsDeNuit(n)).toEqual({ adore: 1, bien: 0, neutre: 1 });
  });
});
