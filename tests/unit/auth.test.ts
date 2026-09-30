import { describe, it, expect } from 'vitest';
import { registerUser, verifyLogin, createSession, getUserByToken } from '@/lib/auth';
import { getDb } from '@/lib/db';

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
