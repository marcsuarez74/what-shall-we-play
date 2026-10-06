import { describe, expect, test } from 'vitest';
import { getDb, runMigrations } from '@/lib/db';
import { registerUser } from '@/lib/auth';

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
