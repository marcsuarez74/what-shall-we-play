import { describe, expect, it } from 'vitest';
import { getDb, runMigrations, purger } from '@/lib/db';
import { registerUser, creerInvite, verifyLogin, createSession, getUserByToken, createDeviceToken, consommerDeviceToken, hacherJeton, convertirInvite } from '@/lib/auth';
import { createNight, setNightPlayers } from '@/lib/nights';
import { minutesBloquees, noterEchec, effacer } from '@/lib/limite';
import { formatImage } from '@/lib/storage';

// v4.7.2 — lot A de l'audit : limite de tentatives, jetons hachés, purge,
// pseudo d'invité libéré, format d'image lu dans les octets.
let n = 0;
const pseudo = (p: string) => `${p}${Date.now().toString(36)}${n++}`.slice(0, 20);
const id = (r: unknown) => (r as { id: number }).id;

describe('limite de tentatives', () => {
  it('bloque après N échecs, pour la fenêtre de 15 min, puis libère', () => {
    const cle = `p:${pseudo('lim_')}`;
    const t0 = 1_000_000;
    for (let i = 0; i < 4; i++) noterEchec(cle, t0);
    expect(minutesBloquees(cle, 5, t0)).toBe(0);
    noterEchec(cle, t0);
    expect(minutesBloquees(cle, 5, t0)).toBe(15);
    expect(minutesBloquees(cle, 5, t0 + 14 * 60_000)).toBe(1);
    expect(minutesBloquees(cle, 5, t0 + 16 * 60_000)).toBe(0); // fenêtre close
  });

  it('effacer remet le compteur à zéro (connexion réussie)', () => {
    const cle = `p:${pseudo('lim2_')}`;
    for (let i = 0; i < 5; i++) noterEchec(cle);
    expect(minutesBloquees(cle, 5)).toBeGreaterThan(0);
    effacer(cle);
    expect(minutesBloquees(cle, 5)).toBe(0);
  });

  it('verifyLogin est asynchrone (bcrypt.compare, non bloquant)', async () => {
    const p = pseudo('async_');
    registerUser(p, '1234');
    const r = verifyLogin(p, '1234');
    expect(r).toBeInstanceOf(Promise);
    expect(await r).toHaveProperty('id');
  });
});

describe('jetons hachés en base', () => {
  it('session : seule l’empreinte est stockée, le jeton clair ouvre la session', () => {
    const u = id(registerUser(pseudo('tok_'), '1234'));
    const token = createSession(u, 1);
    const db = getDb();
    expect(db.prepare('SELECT 1 FROM sessions WHERE token = ?').get(token)).toBeUndefined();
    expect(db.prepare('SELECT 1 FROM sessions WHERE token = ?').get(hacherJeton(token))).toBeTruthy();
    expect(getUserByToken(token)?.id).toBe(u);
  });

  it('jeton d’appareil : empreinte en base, consommation par le jeton clair', () => {
    const u = id(registerUser(pseudo('dev_'), '1234'));
    const token = createDeviceToken(u);
    expect(getDb().prepare('SELECT 1 FROM device_tokens WHERE token = ?').get(token)).toBeUndefined();
    expect(consommerDeviceToken(token)?.userId).toBe(u);
    expect(consommerDeviceToken(token)).toBeNull(); // usage unique
  });

  it('migration : les jetons clairs existants sont hachés une fois, les sessions restent valides', () => {
    const db = getDb();
    const u = id(registerUser(pseudo('mig_'), '1234'));
    const clair = `clair${Date.now()}`;
    db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now','+1 day'))").run(clair, u);
    db.pragma('user_version = 0');
    runMigrations(db);
    expect(db.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(1);
    expect(getUserByToken(clair)?.id).toBe(u);
    runMigrations(db); // idempotent : pas de double hachage
    expect(getUserByToken(clair)?.id).toBe(u);
  });
});

describe('purge au démarrage', () => {
  it('sessions expirées et invités sans soirée partent ; un invité dans une soirée reste', () => {
    const db = getDb();
    const hote = id(registerUser(pseudo('pur_'), '1234'));
    db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now','-1 day'))").run(`exp${Date.now()}`, hote);
    const orphelin = id(creerInvite(`Orphelin ${n++}`, hote));
    const present = id(creerInvite(`Présent ${n++}`, hote));
    const nuit = createNight(hote, [hote]);
    setNightPlayers(nuit, [hote, present]);
    purger(db);
    expect(db.prepare("SELECT COUNT(*) AS c FROM sessions WHERE expires_at <= datetime('now')").get()).toEqual({ c: 0 });
    expect(db.prepare('SELECT 1 FROM users WHERE id = ?').get(orphelin)).toBeUndefined();
    expect(db.prepare('SELECT 1 FROM users WHERE id = ?').get(present)).toBeTruthy();
  });
});

describe('pseudo d’invité', () => {
  it('un compte peut prendre le pseudo d’un invité : l’invité devient « Thib 2 »', () => {
    const hote = id(registerUser(pseudo('ps_'), '1234'));
    const nom = pseudo('Thib');
    const inv = id(creerInvite(nom, hote));
    const compte = registerUser(nom, '1234');
    expect(compte).toHaveProperty('id');
    const renomme = getDb().prepare('SELECT pseudo FROM users WHERE id = ?').get(inv) as { pseudo: string };
    expect(renomme.pseudo).toBe(`${nom} 2`);
  });

  it('idem à la conversion d’un autre invité en compte', () => {
    const hote = id(registerUser(pseudo('ps2_'), '1234'));
    const nom = pseudo('Lea');
    const a = id(creerInvite(nom, hote));
    const b = id(creerInvite(`Autre ${n++}`, hote));
    expect(convertirInvite(b, nom, '1234')).toMatchObject({ id: b });
    expect((getDb().prepare('SELECT pseudo FROM users WHERE id = ?').get(a) as { pseudo: string }).pseudo).toBe(`${nom} 2`);
  });

  it('un compte existant n’est jamais renommé : pseudo pris', () => {
    const nom = pseudo('pris_');
    registerUser(nom, '1234');
    expect(registerUser(nom, '1234')).toMatchObject({ status: 409 });
  });
});

describe('format d’image lu dans les octets', () => {
  it('jpeg, png, webp reconnus ; le reste refusé quel que soit le nom', () => {
    expect(formatImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
    expect(formatImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
    expect(formatImage(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]))).toBe('webp');
    expect(formatImage(Buffer.from('<svg onload=alert(1)>'))).toBeNull();
    expect(formatImage(Buffer.from('MZ'))).toBeNull();
  });
});
