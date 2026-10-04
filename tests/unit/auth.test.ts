import { describe, it, expect } from 'vitest';
import { registerUser, verifyLogin, createSession, getUserByToken, validateCode } from '@/lib/auth';
import { changeCode } from '@/lib/users';
import { getDb } from '@/lib/db';

describe('code à 4 chiffres', () => {
  it('accepte 4 chiffres', () => expect(validateCode('1234')).toBeNull());
  it('rejette lettres', () => expect(validateCode('abcd')).toMatch('4 chiffres'));
  it('rejette 3 chiffres', () => expect(validateCode('123')).toMatch('4 chiffres'));
  it('rejette 5 chiffres', () => expect(validateCode('12345')).toMatch('4 chiffres'));
  it('changeCode : courant requis, 4 chiffres, effectif', () => {
    const u = (registerUser('p-code', '1234') as { id: number }).id;
    expect(changeCode(u, '9999', '5678')).toEqual({ error: 'Code actuel incorrect', status: 401 });
    expect(changeCode(u, '1234', '567')).toEqual({ error: 'Nouveau code : 4 chiffres', status: 400 });
    expect(changeCode(u, '1234', 'abcd')).toEqual({ error: 'Nouveau code : 4 chiffres', status: 400 });
    expect(changeCode(u, '1234', '5678')).toEqual({ ok: true });
    expect(verifyLogin('p-code', '5678')).toHaveProperty('id');
    expect((verifyLogin('p-code', '1234') as { status: number }).status).toBe(401);
  });
});

describe('onboarding emoji', () => {
  it('registerUser : sticker de la grille validée posé à la création', () => {
    const u = (registerUser('p-emo', '1234', '🦊') as { id: number }).id;
    const row = getDb().prepare('SELECT sticker FROM users WHERE id = ?').get(u) as { sticker: string | null };
    expect(row.sticker).toBe('🦊');
  });
  it('registerUser : emoji hors grille rejeté ; défaut = dé', () => {
    expect((registerUser('p-emo-x', '1234', '🚽') as { status: number }).status).toBe(400);
    const u = (registerUser('p-emo-d', '1234') as { id: number }).id;
    const row = getDb().prepare('SELECT sticker FROM users WHERE id = ?').get(u) as { sticker: string | null };
    expect(row.sticker).toBeNull();
  });
});

describe('auth', () => {
  it('refuse un pseudo trop court / code trop court', () => {
    expect((registerUser('ab', '1234') as { status: number }).status).toBe(400);
    expect((registerUser('marc', 'abc') as { status: number }).status).toBe(400);
  });
  it('inscrit puis connecte', () => {
    const r = registerUser('marc', '1234');
    expect('id' in r && r.id > 0).toBe(true);
    expect(verifyLogin('marc', '1234')).toHaveProperty('id');
    expect(verifyLogin('marc', '0000')).toEqual({ error: 'Identifiants incorrects', status: 401 });
  });
  it('registerUser : persiste la langue de navigation dans users.lang', () => {
    const u = (registerUser('p-lang', '1234', undefined, 'en') as { id: number }).id;
    const row = getDb().prepare('SELECT lang FROM users WHERE id = ?').get(u) as { lang: string };
    expect(row.lang).toBe('en');
  });
  it('refuse le doublon à la casse près', () => {
    registerUser('lea', '1234');
    const r = registerUser('LEA', '5678');
    expect(r).toEqual({ error: 'Pseudo déjà pris', status: 409 });
  });
  it('session : crée, lit, expire', () => {
    const id = (registerUser('thibault', '1234') as { id: number }).id;
    const token = createSession(id);
    expect(getUserByToken(token)?.pseudo).toBe('thibault');
    const db = getDb();
    db.prepare(`UPDATE sessions SET expires_at = datetime('now','-1 day')`).run();
    expect(getUserByToken(token)).toBeNull();
  });
});
