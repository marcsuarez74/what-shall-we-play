import { describe, expect, test } from 'vitest';
import { getDb, runMigrations } from '@/lib/db';
import { registerUser, creerInvite, verifyLogin, getUserByToken, createSession, createDeviceToken, consommerDeviceToken, refuserInvite } from '@/lib/auth';
import { createNight, getNight, getNightPlayers, rejoindreParLien, retirerInvite, setNightPlayers } from '@/lib/nights';

describe('schéma invités (v4.6.0)', () => {
  test('colonnes est_invite / host_id / lien_token présentes et idempotentes', () => {
    const db = getDb();
    // migrations rejouées : « duplicate column » avalé, aucune erreur
    expect(() => runMigrations(db)).not.toThrow();
    const marc = registerUser(`sch_${Date.now().toString(36)}`, '1234') as { id: number };
    db.prepare("UPDATE users SET est_invite = 1, host_id = ? WHERE id = ?").run(marc.id, marc.id);
    const u = db.prepare('SELECT est_invite, host_id FROM users WHERE id = ?').get(marc.id) as { est_invite: number; host_id: number };
    expect(u.est_invite).toBe(1);
    expect(u.host_id).toBe(marc.id);
    const n = db.prepare("INSERT INTO nights (creator_id, lien_token) VALUES (?, 'tok123') RETURNING lien_token").get(marc.id) as { lien_token: string };
    expect(n.lien_token).toBe('tok123');
  });
});

describe('creerInvite', () => {
  test('pseudo = nom choisi, unique ; collision → suffixe « 2 »', () => {
    const hote = (registerUser(`cinv_${Date.now().toString(36)}`, '1234') as { id: number }).id;
    const nom = `Sophie ${Date.now().toString(36)}`; // unique par run : les tests du fichier partagent la DB
    const a = creerInvite(nom, hote) as { id: number };
    const b = creerInvite(nom, hote) as { id: number };
    const db = getDb();
    const pa = db.prepare('SELECT pseudo, est_invite, host_id FROM users WHERE id = ?').get(a.id) as { pseudo: string; est_invite: number; host_id: number };
    const pb = db.prepare('SELECT pseudo FROM users WHERE id = ?').get(b.id) as { pseudo: string };
    expect(pa.pseudo).toBe(nom);
    expect(pb.pseudo).toBe(`${nom} 2`);
    expect(pa.est_invite).toBe(1);
    expect(pa.host_id).toBe(hote);
  });

  test('trim + espaces internes réduits ; vide rejeté ; > 20 rejeté', () => {
    const hote = (registerUser(`cinv2_${Date.now().toString(36)}`, '1234') as { id: number }).id;
    const ok = creerInvite('  Jean-Marc   de la Cour ', hote) as { id: number };
    const db = getDb();
    expect((db.prepare('SELECT pseudo FROM users WHERE id = ?').get(ok.id) as { pseudo: string }).pseudo).toBe('Jean-Marc de la Cour');
    expect((creerInvite('   ', hote) as { error: string }).error).toBeTruthy();
    expect((creerInvite('x'.repeat(21), hote) as { error: string }).error).toBeTruthy();
  });

  test('la connexion d’un invité est rejetée', async () => {
    const stamp = Date.now().toString(36);
    const hote = (registerUser(`cinv3_${stamp}`, '1234') as { id: number }).id;
    const inv = creerInvite(`Zoé ${stamp}`, hote) as { id: number };
    const pseudo = (getDb().prepare('SELECT pseudo FROM users WHERE id = ?').get(inv.id) as { pseudo: string }).pseudo;
    const r = await verifyLogin(pseudo, 'nimporte');
    if (!('error' in r)) throw new Error('un invité ne doit jamais se connecter');
    expect(r.status).toBe(401);
    expect(getUserByToken(createSession(inv.id, 1))).toBeTruthy(); // sa session marche, lui
  });
});

describe('lien de soirée', () => {
  test('createNight pose un lien_token unique par soirée', () => {
    const hote = (registerUser(`cinv4_${Date.now().toString(36)}`, '1234') as { id: number }).id;
    const n1 = getNight(createNight(hote, [hote]))!;
    const n2 = getNight(createNight(hote, [hote]))!;
    expect(n1.lien_token).toMatch(/^[0-9a-f]{32}$/);
    expect(n2.lien_token).toMatch(/^[0-9a-f]{32}$/);
    expect(n1.lien_token).not.toBe(n2.lien_token);
  });
});

describe('rejoindreParLien', () => {
  test('hôte + invité par nom ; compte déjà connecté rejoint avec son compte', () => {
    const stamp = Date.now().toString(36);
    const hote = (registerUser(`cinv5_${stamp}`, '1234') as { id: number }).id;
    const compte = (registerUser(`cinv5c_${Date.now().toString(36)}`, '1234') as { id: number }).id;
    const nightId = createNight(hote, [hote]);
    const token = getNight(nightId)!.lien_token;

    const rInvite = rejoindreParLien(nightId, token, `Sophie ${stamp}`, null);
    expect(rInvite).toMatchObject({ ok: true, mode: 'invite' });
    const joueurs = getNightPlayers(nightId);
    expect(joueurs.map((j) => j.pseudo)).toContain(`Sophie ${stamp}`);

    const rCompte = rejoindreParLien(nightId, token, null, { id: compte });
    expect(rCompte).toMatchObject({ ok: true, mode: 'compte' });
    expect(getNightPlayers(nightId).map((j) => j.id)).toContain(compte);

    // déjà joueur : idempotent, pas d'erreur
    expect(rejoindreParLien(nightId, token, null, { id: compte })).toMatchObject({ ok: true, mode: 'compte' });
  });

  test('token faux → 403 ; nom vide → 400 ; token d’une autre soirée → 403', () => {
    const hote = (registerUser(`cinv6_${Date.now().toString(36)}`, '1234') as { id: number }).id;
    const nightId = createNight(hote, [hote]);
    const autre = createNight(hote, [hote]);
    expect(rejoindreParLien(nightId, 'faux', 'X', null)).toMatchObject({ ok: false, status: 403 });
    expect(rejoindreParLien(nightId, null, 'X', null)).toMatchObject({ ok: false, status: 403 });
    expect(rejoindreParLien(nightId, getNight(nightId)!.lien_token, '  ', null)).toMatchObject({ ok: false, status: 400 });
    expect(rejoindreParLien(nightId, getNight(autre)!.lien_token, 'X', null)).toMatchObject({ ok: false, status: 403 });
  });

  test('getNightPlayers expose est_invite (badge + retrait côté UI)', () => {
    const stamp = Date.now().toString(36);
    const hote = (registerUser(`cinv8_${stamp}`, '1234') as { id: number }).id;
    const nightId = createNight(hote, [hote]);
    rejoindreParLien(nightId, getNight(nightId)!.lien_token, `Sophie ${stamp}`, null);
    const joueurs = getNightPlayers(nightId);
    expect(joueurs.find((j) => j.pseudo === `Sophie ${stamp}`)?.est_invite).toBe(1);
    expect(joueurs.find((j) => j.id === hote)?.est_invite).toBe(0);
  });

  test('un invité qui a fait tourner la roue peut être retiré (picks purgés, étagère réattribuée)', () => {
    const stamp = Date.now().toString(36);
    const hote = (registerUser(`cinv9_${stamp}`, '1234') as { id: number }).id;
    const nightId = createNight(hote, [hote]);
    const inv = rejoindreParLien(nightId, getNight(nightId)!.lien_token, `Sophie ${stamp}`, null) as { ok: true; inviteId: number };
    const db = getDb();
    const g = db.prepare('INSERT INTO games (owner_id, title, box_format) VALUES (?, ?, ?)').run(hote, 'Test9', 'moyen');
    // l'invité a ajouté un jeu à l'étagère ET fait tourner la roue
    db.prepare('INSERT INTO night_games (night_id, game_id, added_by) VALUES (?, ?, ?)').run(nightId, Number(g.lastInsertRowid), inv.inviteId);
    db.prepare('INSERT INTO picks (night_id, game_id, spinner_id) VALUES (?, ?, ?)').run(nightId, Number(g.lastInsertRowid), inv.inviteId);
    expect(retirerInvite(nightId, inv.inviteId, hote)).toMatchObject({ ok: true });
    expect(db.prepare('SELECT 1 FROM picks WHERE spinner_id = ?').get(inv.inviteId)).toBeUndefined();
    // le jeu reste sur l'étagère de la soirée (adopté par le créateur)
    const ng = db.prepare('SELECT added_by FROM night_games WHERE night_id = ? AND game_id = ?').get(nightId, Number(g.lastInsertRowid)) as { added_by: number };
    expect(ng.added_by).toBe(hote);
  });

  test('l’hôte de la soirée peut retirer un invité joint par un autre lien', () => {
    const stamp = Date.now().toString(36);
    const hoteA = (registerUser(`cinvA_${stamp}`, '1234') as { id: number }).id;
    const hoteB = (registerUser(`cinvB_${stamp}`, '1234') as { id: number }).id;
    // l'invité est créé par l'hôte A mais rejoint la soirée de l'hôte B
    const inv = creerInvite(`Sophie ${stamp}`, hoteA) as { id: number };
    const nightId = createNight(hoteB, [hoteB]);
    setNightPlayers(nightId, [hoteB, inv.id]);
    expect(retirerInvite(nightId, inv.id, hoteB)).toMatchObject({ ok: true });
  });

  test('on ne peut pas rejoindre une soirée terminée par le lien', () => {
    const stamp = Date.now().toString(36);
    const hote = (registerUser(`cinvT_${stamp}`, '1234') as { id: number }).id;
    const nightId = createNight(hote, [hote]);
    getDb().prepare("UPDATE nights SET status = 'termine', ended_at = datetime('now') WHERE id = ?").run(nightId);
    expect(rejoindreParLien(nightId, getNight(nightId)!.lien_token, `X ${stamp}`, null)).toMatchObject({ ok: false, status: 403 });
  });

  test('un invité ne crée ni soirée ni foyer (garde écrite une fois)', () => {
    const stamp = Date.now().toString(36);
    const hote = (registerUser(`cinvG_${stamp}`, '1234') as { id: number }).id;
    const inv = creerInvite(`Sophie ${stamp}`, hote) as { id: number };
    const invite = getDb().prepare('SELECT * FROM users WHERE id = ?').get(inv.id) as { est_invite?: number };
    expect(refuserInvite(invite)).toMatchObject({ status: 403 });
    const normal = getDb().prepare('SELECT * FROM users WHERE id = ?').get(hote) as { est_invite?: number };
    expect(refuserInvite(normal)).toBeNull();
  });
});

describe('retirerInvite', () => {
  test('l’hôte retire l’invité : users + votes + scores + session purgés (CASCADE comptée)', () => {
    const stamp = Date.now().toString(36);
    const hote = (registerUser(`cinv7_${stamp}`, '1234') as { id: number }).id;
    const autre = (registerUser(`cinv7b_${stamp}`, '1234') as { id: number }).id;
    const nightId = createNight(hote, [hote]);
    const token = getNight(nightId)!.lien_token;
    const inv = rejoindreParLien(nightId, token, `Sophie ${stamp}`, null) as { ok: true; inviteId: number };
    const db = getDb();
    // l'invité a voté et scoré
    const g = db.prepare('INSERT INTO games (owner_id, title, box_format) VALUES (?, ?, ?)').run(hote, 'Test', 'moyen');
    db.prepare('INSERT INTO night_games (night_id, game_id, added_by) VALUES (?, ?, ?)').run(nightId, Number(g.lastInsertRowid), hote);
    db.prepare('INSERT INTO game_votes (night_id, game_id, user_id) VALUES (?, ?, ?)').run(nightId, Number(g.lastInsertRowid), inv.inviteId);
    db.prepare('INSERT INTO night_scores (night_id, user_id, score) VALUES (?, ?, ?)').run(nightId, inv.inviteId, 12);
    // l'invité est sessionné (cookie + jeton d'appareil)
    const sess = createSession(inv.inviteId, 1);
    const dev = createDeviceToken(inv.inviteId);

    // un NON-hôte ne peut pas retirer
    expect(retirerInvite(nightId, inv.inviteId, autre)).toMatchObject({ ok: false, status: 403 });
    // l'hôte retire
    expect(retirerInvite(nightId, inv.inviteId, hote)).toMatchObject({ ok: true });
    expect(db.prepare('SELECT 1 FROM users WHERE id = ?').get(inv.inviteId)).toBeUndefined();
    expect(db.prepare('SELECT 1 FROM game_votes WHERE user_id = ?').get(inv.inviteId)).toBeUndefined();
    expect(db.prepare('SELECT 1 FROM night_scores WHERE user_id = ?').get(inv.inviteId)).toBeUndefined();
    expect(getUserByToken(sess)).toBeNull(); // sa session est morte (CASCADE)
    expect(consommerDeviceToken(dev)).toBeNull(); // son jeton aussi
    // retirer deux fois : 404
    expect(retirerInvite(nightId, inv.inviteId, hote)).toMatchObject({ ok: false, status: 404 });
  });
});
