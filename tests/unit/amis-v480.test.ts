import { describe, expect, test } from 'vitest';
import { getDb, runMigrations } from '@/lib/db';
import { registerUser, creerInvite } from '@/lib/auth';
import {
  demanderAmi, repondreDemande, retirerAmi, etatAmitie, lienAmi, rejoindreParLienAmi, listRelations, listDemandesRecues,
} from '@/lib/amis';
import {
  creerCercle, ajouterMembre, rejoindreParLien as rejoindreCercle, validerMembre, changerRole, retirerMembre,
  quitterCercle, modifierCercle, supprimerCercle, getCercle, membresCercle, coMembres, viaCercles,
} from '@/lib/cercles';
import { inviter, repondre, inscrire, mesInvitations, nbInvitationsEnAttente, invitesNuit, activiteAmis, filtrerJoueurs } from '@/lib/invitations';
import { createNight, getNightPlayers, endNight } from '@/lib/nights';

// v4.8.0 — amis, cercles, invitations, activité.
const id = (r: unknown) => (r as { id: number }).id;
let n = 0;
const pseudo = (p: string) => `${p}${Date.now().toString(36)}${n++}`.slice(0, 20);
const compte = (p = 'a480_') => { const ps = pseudo(p); return { id: id(registerUser(ps, '1234')), pseudo: ps }; };
const jour = (decalage: number) => (getDb().prepare("SELECT date('now','localtime', ?) AS d").get(`${decalage} day`) as { d: string }).d;
function amis(a: number, b: number) {
  const r = rejoindreParLienAmi(b, lienAmi(a));
  if (!('ok' in r)) throw new Error('amitié attendue');
}

describe('amitié', () => {
  test('demande par pseudo : en attente, acceptée → amis réciproques', () => {
    const a = compte(); const b = compte();
    expect(demanderAmi(a.id, b.pseudo)).toMatchObject({ ok: true, etat: 'demande' });
    expect(etatAmitie(a.id, b.id)).toBe('demande_envoyee');
    expect(etatAmitie(b.id, a.id)).toBe('demande_recue');
    expect(listDemandesRecues(b.id).map((u) => u.id)).toEqual([a.id]);
    expect(listRelations(a.id).some((u) => u.id === b.id)).toBe(false); // pas encore amis
    expect(repondreDemande(b.id, a.id, true)).toEqual({ ok: true });
    expect(etatAmitie(a.id, b.id)).toBe('ami');
    expect(listRelations(b.id).some((u) => u.id === a.id)).toBe(true);
  });

  test('demandes croisées : amis directement ; refus : la demande disparaît', () => {
    const a = compte(); const b = compte(); const c = compte();
    demanderAmi(a.id, b.pseudo);
    expect(demanderAmi(b.id, a.pseudo)).toMatchObject({ ok: true, etat: 'ami' });
    demanderAmi(a.id, c.pseudo);
    expect(repondreDemande(c.id, a.id, false)).toEqual({ ok: true });
    expect(etatAmitie(a.id, c.id)).toBeNull();
  });

  test('refus : pseudo inconnu, soi-même, déjà amis, déjà demandé, invité de soirée', () => {
    const a = compte(); const b = compte();
    expect(demanderAmi(a.id, 'personne_x_y')).toMatchObject({ status: 404 });
    expect(demanderAmi(a.id, a.pseudo)).toMatchObject({ status: 400 });
    demanderAmi(a.id, b.pseudo);
    expect(demanderAmi(a.id, b.pseudo)).toMatchObject({ status: 409 });
    repondreDemande(b.id, a.id, true);
    expect(demanderAmi(a.id, b.pseudo)).toMatchObject({ status: 409 });
    const nom = `Invité ${n++}`;
    creerInvite(nom, a.id);
    expect(demanderAmi(a.id, nom)).toMatchObject({ status: 404 }); // un invité n'est jamais ami
  });

  test('lien d’ami : stable, amis dès l’ouverture, lien invalide refusé ; retrait', () => {
    const a = compte(); const b = compte();
    expect(lienAmi(a.id)).toBe(lienAmi(a.id));
    expect(rejoindreParLienAmi(a.id, lienAmi(a.id))).toMatchObject({ status: 400 });
    expect(rejoindreParLienAmi(b.id, 'faux-lien-0000000000')).toMatchObject({ status: 404 });
    expect(rejoindreParLienAmi(b.id, lienAmi(a.id))).toMatchObject({ ok: true, amiId: a.id });
    expect(etatAmitie(a.id, b.id)).toBe('ami');
    expect(retirerAmi(b.id, a.id)).toEqual({ ok: true });
    expect(etatAmitie(a.id, b.id)).toBeNull();
  });

  test('relations = amis + foyer, jamais moi ni les invités', () => {
    const a = compte(); const b = compte(); const f = compte();
    amis(a.id, b.id);
    const db = getDb();
    const foyer = Number(db.prepare("INSERT INTO foyers (name, invite_code, created_by) VALUES ('F', ?, ?)").run(`F${Date.now()}${n++}`.slice(0, 12), a.id).lastInsertRowid);
    db.prepare('UPDATE users SET foyer_id = ? WHERE id IN (?, ?)').run(foyer, a.id, f.id);
    const ids = listRelations(a.id).map((u) => u.id);
    expect(ids).toContain(b.id);
    expect(ids).toContain(f.id);
    expect(ids).not.toContain(a.id);
  });

  test('migration : les comptes ayant joué ensemble deviennent amis, une seule fois', () => {
    const a = compte(); const b = compte(); const seul = compte();
    const nuit = createNight(a.id, [a.id, b.id]);
    expect(nuit).toBeGreaterThan(0);
    const db = getDb();
    db.prepare('DELETE FROM amities WHERE user_a IN (?, ?) OR user_b IN (?, ?)').run(a.id, b.id, a.id, b.id);
    db.pragma('user_version = 1');
    runMigrations(db);
    expect(db.pragma('user_version', { simple: true })).toBe(2);
    expect(etatAmitie(a.id, b.id)).toBe('ami');
    expect(etatAmitie(a.id, seul.id)).toBeNull();
    retirerAmi(a.id, b.id);
    runMigrations(db); // idempotent : un ami retiré ne revient pas
    expect(etatAmitie(a.id, b.id)).toBeNull();
  });
});

describe('cercles', () => {
  test('création : le créateur est admin ; ajout d’un ami seulement', () => {
    const a = compte(); const b = compte(); const inconnu = compte();
    amis(a.id, b.id);
    const c = creerCercle(a.id, '  Les   copains ') as { id: number };
    expect(getCercle(c.id)?.nom).toBe('Les copains');
    expect(creerCercle(a.id, '')).toMatchObject({ status: 400 });
    expect(ajouterMembre(c.id, a.id, inconnu.id)).toMatchObject({ status: 403 });
    expect(ajouterMembre(c.id, a.id, b.id)).toMatchObject({ ok: true, etat: 'membre' });
    expect(ajouterMembre(c.id, a.id, b.id)).toMatchObject({ status: 409 });
    expect(membresCercle(c.id).find((m) => m.id === a.id)?.role).toBe('admin');
  });

  test('adhésion sur validation : arrivées en attente, un admin valide ou refuse', () => {
    const a = compte(); const b = compte(); const c2 = compte(); const d = compte();
    amis(a.id, b.id); amis(b.id, c2.id);
    const c = creerCercle(a.id, 'Jeudi') as { id: number };
    ajouterMembre(c.id, a.id, b.id);
    expect(ajouterMembre(c.id, b.id, c2.id)).toMatchObject({ ok: true, etat: 'attente' }); // simple membre
    const lien = getCercle(c.id)!.lien_token;
    expect(rejoindreCercle(d.id, lien)).toMatchObject({ ok: true, etat: 'attente' });
    expect(validerMembre(c.id, b.id, d.id, true)).toMatchObject({ status: 403 }); // pas admin
    expect(validerMembre(c.id, a.id, d.id, true)).toEqual({ ok: true });
    expect(validerMembre(c.id, a.id, c2.id, false)).toEqual({ ok: true });
    const etats = Object.fromEntries(membresCercle(c.id).map((m) => [m.id, m.etat]));
    expect(etats[d.id]).toBe('membre');
    expect(etats[c2.id]).toBeUndefined();
  });

  test('adhésion libre : le lien suffit, tout membre ajoute ses amis', () => {
    const a = compte(); const b = compte(); const c2 = compte(); const d = compte();
    amis(a.id, b.id); amis(b.id, c2.id);
    const c = creerCercle(a.id, 'Libre') as { id: number };
    expect(modifierCercle(c.id, a.id, { adhesion: 'libre' })).toEqual({ ok: true });
    expect(modifierCercle(c.id, a.id, { adhesion: 'nimporte' })).toMatchObject({ status: 400 });
    ajouterMembre(c.id, a.id, b.id);
    expect(ajouterMembre(c.id, b.id, c2.id)).toMatchObject({ etat: 'membre' });
    expect(rejoindreCercle(d.id, getCercle(c.id)!.lien_token)).toMatchObject({ etat: 'membre' });
    expect(modifierCercle(c.id, b.id, { adhesion: 'validation' })).toMatchObject({ status: 403 }); // pas admin
  });

  test('admins multiples ; le dernier admin ne part pas sans en nommer un', () => {
    const a = compte(); const b = compte();
    amis(a.id, b.id);
    const c = creerCercle(a.id, 'Admins') as { id: number };
    ajouterMembre(c.id, a.id, b.id);
    expect(changerRole(c.id, a.id, a.id, 'membre')).toMatchObject({ status: 409 });
    expect(quitterCercle(c.id, a.id)).toMatchObject({ status: 409 });
    expect(changerRole(c.id, a.id, b.id, 'admin')).toEqual({ ok: true });
    expect(retirerMembre(c.id, b.id, a.id)).toEqual({ ok: true }); // un admin retire un autre admin
    expect(membresCercle(c.id).map((m) => m.id)).toEqual([b.id]);
  });

  test('quitter en dernier emporte le cercle ; supprimer ne touche ni parties ni comptes', () => {
    const a = compte(); const b = compte();
    amis(a.id, b.id);
    const seul = creerCercle(a.id, 'Solo') as { id: number };
    expect(quitterCercle(seul.id, a.id)).toEqual({ ok: true });
    expect(getCercle(seul.id)).toBeNull();
    const c = creerCercle(a.id, 'À supprimer') as { id: number };
    ajouterMembre(c.id, a.id, b.id);
    const nuit = createNight(a.id, [a.id], { playedAt: jour(2) });
    inviter(nuit, a.id, [b.id], viaCercles(a.id, [c.id]));
    expect(supprimerCercle(c.id, b.id)).toMatchObject({ status: 403 });
    expect(supprimerCercle(c.id, a.id)).toEqual({ ok: true });
    expect(getCercle(c.id)).toBeNull();
    expect(invitesNuit(nuit).map((i) => i.id)).toEqual([b.id]); // l'invitation reste
    expect(getDb().prepare('SELECT 1 FROM users WHERE id = ?').get(b.id)).toBeTruthy();
  });

  test('co-membres invitables même sans être amis', () => {
    const a = compte(); const b = compte(); const c2 = compte();
    amis(a.id, b.id); amis(a.id, c2.id);
    const c = creerCercle(a.id, 'Mix') as { id: number };
    ajouterMembre(c.id, a.id, b.id); ajouterMembre(c.id, a.id, c2.id);
    expect(coMembres(b.id).sort()).toEqual([a.id, c2.id].sort());
    expect(filtrerJoueurs(b.id, [c2.id, 999999])).toEqual([c2.id]);
  });
});

describe('invitations', () => {
  function partie() {
    const hote = compte('h480_'); const b = compte(); const c2 = compte();
    amis(hote.id, b.id); amis(hote.id, c2.id);
    const nuit = createNight(hote.id, [hote.id], { playedAt: jour(3) });
    inviter(nuit, hote.id, [b.id, c2.id]);
    return { hote, b, c2, nuit };
  }

  test('programmer invite : en attente, pas joueur ; pastille', () => {
    const { b, nuit } = partie();
    expect(getNightPlayers(nuit).map((p) => p.id)).not.toContain(b.id);
    expect(mesInvitations(b.id).map((i) => i.id)).toContain(nuit);
    expect(nbInvitationsEnAttente(b.id)).toBeGreaterThanOrEqual(1);
  });

  test('Dispo → joueur tout de suite ; Pas dispo → retiré ; modifiable', () => {
    const { b, nuit } = partie();
    expect(repondre(nuit, b.id, 'dispo')).toEqual({ ok: true });
    expect(getNightPlayers(nuit).map((p) => p.id)).toContain(b.id);
    expect(mesInvitations(b.id).some((i) => i.id === nuit)).toBe(false); // passée dans Programmées
    expect(repondre(nuit, b.id, 'absent')).toEqual({ ok: true });
    expect(getNightPlayers(nuit).map((p) => p.id)).not.toContain(b.id);
    expect(mesInvitations(b.id).find((i) => i.id === nuit)?.etat).toBe('absent');
    expect(repondre(nuit, b.id, 'peut-etre')).toMatchObject({ status: 400 });
  });

  test('l’organisateur inscrit un sans-réponse ; personne d’autre', () => {
    const { hote, b, c2, nuit } = partie();
    expect(inscrire(nuit, b.id, c2.id)).toMatchObject({ status: 403 });
    expect(inscrire(nuit, hote.id, c2.id)).toEqual({ ok: true });
    expect(invitesNuit(nuit).find((i) => i.id === c2.id)?.etat).toBe('dispo');
    expect(getNightPlayers(nuit).map((p) => p.id)).toContain(c2.id);
  });

  test('pas d’invitation pour un inconnu, ni de réponse sans invitation', () => {
    const { hote, nuit } = partie();
    const inconnu = compte();
    expect(inviter(nuit, hote.id, [inconnu.id])).toEqual([]);
    expect(repondre(nuit, inconnu.id, 'dispo')).toMatchObject({ status: 404 });
  });

  test('partie terminée : plus de réponse possible', () => {
    const { hote, b, nuit } = partie();
    getDb().prepare('UPDATE nights SET played_at = ? WHERE id = ?').run(jour(0), nuit);
    endNight(nuit, hote.id);
    expect(repondre(nuit, b.id, 'dispo')).toMatchObject({ status: 404 });
  });
});

describe('activité', () => {
  test('parties terminées des 30 derniers jours avec au moins un ami', () => {
    const moi = compte(); const ami = compte(); const autre = compte();
    amis(moi.id, ami.id);
    const recente = createNight(ami.id, [ami.id, autre.id]);
    endNight(recente, ami.id);
    const vieille = createNight(ami.id, [ami.id]);
    endNight(vieille, ami.id);
    getDb().prepare('UPDATE nights SET played_at = ? WHERE id = ?').run(jour(-40), vieille);
    const sansAmi = createNight(autre.id, [autre.id]);
    endNight(sansAmi, autre.id);
    const ids = activiteAmis(moi.id).map((a) => a.id);
    expect(ids).toContain(recente);
    expect(ids).not.toContain(vieille);
    expect(ids).not.toContain(sansAmi);
    const a = activiteAmis(moi.id).find((x) => x.id === recente)!;
    expect(a.amis).toEqual([ami.pseudo]);
    expect(a.nb).toBe(2);
  });
});
