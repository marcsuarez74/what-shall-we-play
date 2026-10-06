import { describe, expect, test } from 'vitest';
import { getDb } from '@/lib/db';
import { registerUser, convertirInvite, verifyLogin } from '@/lib/auth';
import {
  createNight, getNight, getNightPlayers, rejoindreParLien, retirerInvite, supprimerNuit, drawAllowed,
  boxOutNight, estFuture, getShelfNight, getInviteNight, modifierInfosNuit, normaliserTitre,
  addNightGame, toggleNightVote, endNight,
} from '@/lib/nights';
import { listComptes } from '@/lib/users';
import { createGame } from '@/lib/games';

// v4.7.0 — refonte des invités : soirée unique, retrait par soi-même, conversion
// en compte, partie programmée (étagère ouverte, tirage le jour J), titre, suppression.
const id = (r: unknown) => (r as { id: number }).id;
const demain = () => (getDb().prepare("SELECT date('now','localtime','+1 day') AS d").get() as { d: string }).d;
let n = 0;
const pseudo = (p: string) => `${p}${Date.now().toString(36)}${n++}`.slice(0, 20);

function soireeAvecInvite(opts?: { playedAt?: string }) {
  const hote = id(registerUser(pseudo('h470_'), '1234'));
  const nightId = createNight(hote, [hote], opts);
  const r = rejoindreParLien(nightId, getNight(nightId)!.lien_token, `Léa ${n++}`, null);
  if (!r.ok || r.mode !== 'invite') throw new Error('jointure invité attendue');
  return { hote, nightId, invite: r.inviteId as number };
}

describe('titre de partie', () => {
  test('normaliserTitre : espaces réduits, vide → null, > 40 refusé', () => {
    expect(normaliserTitre('  Soirée   Azul ')).toBe('Soirée Azul');
    expect(normaliserTitre('   ')).toBeNull();
    expect(normaliserTitre(undefined)).toBeUndefined();
    expect(normaliserTitre('x'.repeat(41))).toBe(false);
    expect(normaliserTitre(12)).toBe(false);
  });

  test('createNight pose le titre ; modifierInfosNuit le change (créateur seulement)', () => {
    const hote = id(registerUser(pseudo('t470_'), '1234'));
    const autre = id(registerUser(pseudo('t470b_'), '1234'));
    const nightId = createNight(hote, [hote, autre], { playedAt: demain(), titre: 'Soirée Azul' });
    expect(getNight(nightId)!.titre).toBe('Soirée Azul');
    expect(modifierInfosNuit(nightId, autre, { titre: 'Pirate' })).toMatchObject({ status: 403 });
    expect(modifierInfosNuit(nightId, hote, { titre: null })).toEqual({ ok: true });
    expect(getNight(nightId)!.titre).toBeNull();
  });
});

describe('partie programmée', () => {
  test('étagère ouverte à l’avance, tirage et boîte refusés avant le jour J', () => {
    const hote = id(registerUser(pseudo('p470_'), '1234'));
    const g = createGame(hote, { title: 'Azul', box_format: 'moyen' });
    const nightId = createNight(hote, [hote], { playedAt: demain() });
    const night = getNight(nightId)!;
    expect(estFuture(night)).toBe(true);
    expect(getShelfNight(hote, nightId)?.id).toBe(nightId);
    expect(addNightGame(nightId, g, hote)).toEqual({ ok: true });
    expect(drawAllowed(nightId)).toMatchObject({ status: 409 });
    expect(boxOutNight(nightId, hote, g)).toMatchObject({ status: 409 });
  });

  test('getShelfNight refuse une partie d’un autre ou terminée', () => {
    const hote = id(registerUser(pseudo('p470c_'), '1234'));
    const intrus = id(registerUser(pseudo('p470d_'), '1234'));
    const nightId = createNight(hote, [hote]);
    expect(getShelfNight(intrus, nightId)).toBeNull();
    endNight(nightId, hote);
    expect(getShelfNight(hote, nightId)).toBeNull();
  });
});

describe('invité restreint à sa soirée', () => {
  test('un invité rejoint une partie programmée et la retrouve ; il vote', () => {
    const { hote, nightId, invite } = soireeAvecInvite({ playedAt: demain() });
    expect(getInviteNight(invite)?.id).toBe(nightId);
    const g = createGame(hote, { title: 'Cascadia', box_format: 'moyen' });
    addNightGame(nightId, g, hote);
    expect(toggleNightVote(nightId, g, invite)).toEqual({ ok: true });
  });

  test('un invité n’est jamais proposé comme joueur', () => {
    const { invite } = soireeAvecInvite();
    expect(listComptes().some((u) => u.id === invite)).toBe(false);
  });

  test('l’invité se retire lui-même : sa ligne disparaît', () => {
    const { nightId, invite } = soireeAvecInvite();
    expect(retirerInvite(nightId, invite, invite)).toEqual({ ok: true });
    expect(getDb().prepare('SELECT 1 FROM users WHERE id = ?').get(invite)).toBeUndefined();
    expect(getNightPlayers(nightId).some((p) => p.id === invite)).toBe(false);
  });

  test('un invité ne retire pas un autre invité', () => {
    const { nightId, invite } = soireeAvecInvite();
    const autre = rejoindreParLien(nightId, getNight(nightId)!.lien_token, `Karim ${n++}`, null);
    if (!autre.ok) throw new Error('jointure attendue');
    expect(retirerInvite(nightId, autre.inviteId as number, invite)).toMatchObject({ status: 403 });
  });
});

describe('conversion invité → compte', () => {
  test('même ligne : votes et soirée conservés, connexion possible', () => {
    const { hote, nightId, invite } = soireeAvecInvite();
    const g = createGame(hote, { title: 'Skull', box_format: 'petit' });
    addNightGame(nightId, g, hote);
    toggleNightVote(nightId, g, invite);
    const p = pseudo('conv_');
    expect(convertirInvite(invite, p, '4321')).toMatchObject({ id: invite });
    const row = getDb().prepare('SELECT est_invite, host_id FROM users WHERE id = ?').get(invite) as { est_invite: number; host_id: number | null };
    expect(row).toEqual({ est_invite: 0, host_id: null });
    expect(getDb().prepare('SELECT 1 FROM game_votes WHERE user_id = ?').get(invite)).toBeTruthy();
    expect(verifyLogin(p, '4321')).toMatchObject({ id: invite });
    expect(listComptes().some((u) => u.id === invite)).toBe(true);
  });

  test('pseudo invalide, pris, ou compte déjà converti : refusé', () => {
    const { invite } = soireeAvecInvite();
    expect(convertirInvite(invite, 'é é', '1234')).toMatchObject({ status: 400 });
    expect(convertirInvite(invite, pseudo('cv_'), '12')).toMatchObject({ status: 400 });
    const pris = pseudo('pris_');
    registerUser(pris, '1234');
    expect(convertirInvite(invite, pris, '1234')).toMatchObject({ status: 409 });
    const compte = id(registerUser(pseudo('deja_'), '1234'));
    expect(convertirInvite(compte, pseudo('x_'), '1234')).toMatchObject({ status: 403 });
  });
});

describe('suppression d’une partie programmée', () => {
  test('créateur seulement ; ses invités partent avec elle', () => {
    const { hote, nightId, invite } = soireeAvecInvite({ playedAt: demain() });
    const joueur = id(registerUser(pseudo('sup_'), '1234'));
    rejoindreParLien(nightId, getNight(nightId)!.lien_token, null, { id: joueur });
    expect(supprimerNuit(nightId, joueur)).toMatchObject({ status: 403 });
    expect(supprimerNuit(nightId, hote)).toEqual({ ok: true });
    expect(getNight(nightId)).toBeNull();
    expect(getDb().prepare('SELECT 1 FROM users WHERE id = ?').get(invite)).toBeUndefined();
    expect(getDb().prepare('SELECT 1 FROM users WHERE id = ?').get(joueur)).toBeTruthy(); // un compte reste
  });
});
