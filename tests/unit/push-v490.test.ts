import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { getDb } from '@/lib/db';
import { registerUser } from '@/lib/auth';
import { abonner, desabonner, prefsNotif, reglerNotif, notifier, seuilRappel, envoyerRappels, clesVapid, transport } from '@/lib/push';
import { demanderAmi, lienAmi, rejoindreParLienAmi } from '@/lib/amis';
import { inviter, repondre } from '@/lib/invitations';
import { createNight } from '@/lib/nights';

// v4.9.0 — notifications push : abonnements, préférences par type, envois, rappel du jour J.
const id = (r: unknown) => (r as { id: number }).id;
let n = 0;
const pseudo = (p: string) => `${p}${Date.now().toString(36)}${n++}`.slice(0, 20);
const compte = () => { const ps = pseudo('p490_'); return { id: id(registerUser(ps, '1234')), pseudo: ps }; };
const sub = (k: string) => ({ endpoint: `https://push.example/${k}${n++}`, keys: { p256dh: 'p', auth: 'a' } });
const jour = (d: number) => (getDb().prepare("SELECT date('now','localtime', ?) AS d").get(`${d} day`) as { d: string }).d;

let envois: { endpoint: string; message: { titre: string; corps?: string; url: string; tag?: string } }[] = [];
const original = transport.envoyer;
beforeEach(() => {
  envois = [];
  transport.envoyer = async (a, donnees) => { envois.push({ endpoint: a.endpoint, message: JSON.parse(donnees) }); };
});
afterEach(() => { transport.envoyer = original; });

describe('abonnements et préférences', () => {
  test('clés VAPID stables ; abonnement validé, désabonnement par appareil', () => {
    expect(clesVapid().publicKey).toBe(clesVapid().publicKey);
    const u = compte();
    expect(abonner(u.id, { endpoint: 'http://pas-https', keys: { p256dh: 'p', auth: 'a' } })).toBe(false);
    expect(abonner(u.id, { endpoint: 'https://x' })).toBe(false);
    const s = sub('a');
    expect(abonner(u.id, s)).toBe(true);
    expect(abonner(u.id, s)).toBe(true); // ré-abonner le même appareil : pas de doublon
    expect(getDb().prepare('SELECT COUNT(*) AS c FROM push_abonnements WHERE user_id = ?').get(u.id)).toEqual({ c: 1 });
    desabonner(u.id, s.endpoint);
    expect(getDb().prepare('SELECT COUNT(*) AS c FROM push_abonnements WHERE user_id = ?').get(u.id)).toEqual({ c: 0 });
  });

  test('tous les types actifs par défaut ; un type se coupe et se rallume', () => {
    const u = compte();
    expect(prefsNotif(u.id)).toEqual({ invitations: true, reponses: true, rappel: true, amis: true });
    expect(reglerNotif(u.id, 'amis', false)).toBe(true);
    expect(reglerNotif(u.id, 'inconnu', false)).toBe(false);
    expect(reglerNotif(u.id, 'rappel', 'non')).toBe(false);
    expect(prefsNotif(u.id).amis).toBe(false);
    reglerNotif(u.id, 'amis', true);
    expect(prefsNotif(u.id).amis).toBe(true);
  });
});

describe('envois', () => {
  test('chaque appareil reçoit ; un type coupé n’envoie rien ; texte dans la langue du compte', async () => {
    const u = compte();
    abonner(u.id, sub('a')); abonner(u.id, sub('b'));
    getDb().prepare("UPDATE users SET lang = 'en' WHERE id = ?").run(u.id);
    await notifier([u.id], 'amis', (lang) => ({ titre: lang, url: '/amis' }));
    expect(envois.map((e) => e.message.titre)).toEqual(['en', 'en']);
    reglerNotif(u.id, 'amis', false);
    envois = [];
    await notifier([u.id], 'amis', () => ({ titre: 'x', url: '/amis' }));
    expect(envois).toEqual([]);
  });

  test('abonnement expiré (410) : oublié', async () => {
    const u = compte();
    const s = sub('exp');
    abonner(u.id, s);
    transport.envoyer = async () => { throw Object.assign(new Error('gone'), { statusCode: 410 }); };
    await notifier([u.id], 'amis', () => ({ titre: 'x', url: '/' }));
    expect(getDb().prepare('SELECT 1 FROM push_abonnements WHERE endpoint = ?').get(s.endpoint)).toBeUndefined();
  });

  test('demande d’ami, invitation et réponse préviennent la bonne personne', async () => {
    const a = compte(); const b = compte();
    abonner(a.id, sub('a')); abonner(b.id, sub('b'));
    demanderAmi(a.id, b.pseudo);
    await new Promise((r) => setTimeout(r, 0));
    expect(envois.map((e) => e.message.url)).toEqual(['/amis']);
    expect(envois[0].message.titre).toContain(a.pseudo);
    rejoindreParLienAmi(b.id, lienAmi(a.id));
    envois = [];
    const nuit = createNight(a.id, [a.id], { playedAt: jour(3), titre: 'Soirée Azul' });
    inviter(nuit, a.id, [b.id]);
    await new Promise((r) => setTimeout(r, 0));
    expect(envois).toHaveLength(1);
    expect(envois[0].message).toMatchObject({ url: '/nights', tag: `invitation-${nuit}` });
    expect(envois[0].message.corps).toContain('Soirée Azul');
    envois = [];
    repondre(nuit, b.id, 'dispo');
    await new Promise((r) => setTimeout(r, 0));
    expect(envois).toHaveLength(1);
    expect(envois[0].message.titre).toBe(`${b.pseudo} est dispo`);
  });
});

describe('rappel du jour J', () => {
  test('10 h, ou 2 h avant l’heure prévue si c’est plus tard', () => {
    expect(seuilRappel(null)).toBe('10:00');
    expect(seuilRappel('11:00')).toBe('10:00');
    expect(seuilRappel('20:30')).toBe('18:30');
    expect(seuilRappel('01:00')).toBe('10:00');
  });

  test('envoyé aux joueurs une seule fois, pas avant le seuil', async () => {
    const a = compte();
    abonner(a.id, sub('r'));
    const nuit = createNight(a.id, [a.id], { playedAt: jour(0), startTime: '20:30' });
    const aujourdhui = (h: string) => new Date(`${jour(0)}T${h}:00`);
    await envoyerRappels(aujourdhui('17:00'));
    expect(envois.filter((e) => e.message.tag === `rappel-${nuit}`)).toEqual([]);
    await envoyerRappels(aujourdhui('18:35'));
    expect(envois.filter((e) => e.message.tag === `rappel-${nuit}`)).toHaveLength(1);
    expect(envois.find((e) => e.message.tag === `rappel-${nuit}`)!.message.url).toBe(`/etagere?night=${nuit}`);
    await envoyerRappels(aujourdhui('19:00'));
    expect(envois.filter((e) => e.message.tag === `rappel-${nuit}`)).toHaveLength(1);
  });
});
