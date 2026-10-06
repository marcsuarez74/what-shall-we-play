import { describe, expect, test } from 'vitest';
import { getDb, runMigrations } from '@/lib/db';
import { registerUser, creerInvite, verifyLogin, getUserByToken, createSession } from '@/lib/auth';
import { createNight, getNight, getNightPlayers, rejoindreParLien } from '@/lib/nights';

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

  test('la connexion d’un invité est rejetée', () => {
    const stamp = Date.now().toString(36);
    const hote = (registerUser(`cinv3_${stamp}`, '1234') as { id: number }).id;
    const inv = creerInvite(`Zoé ${stamp}`, hote) as { id: number };
    const pseudo = (getDb().prepare('SELECT pseudo FROM users WHERE id = ?').get(inv.id) as { pseudo: string }).pseudo;
    const r = verifyLogin(pseudo, 'nimporte');
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
});
