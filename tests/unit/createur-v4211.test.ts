import { describe, it, expect, vi } from 'vitest';
import { registerUser } from '@/lib/auth';
import { createNight, corrigerNuit, getNightPlayers } from '@/lib/nights';
import { getDb } from '@/lib/db';

// v4.21.1 — un invité ne peut plus modifier les joueurs d'une partie ni en retirer l'initiateur.
let sessionId = 0;
vi.mock('@/lib/i18n/server', () => ({ getLang: async () => 'fr' }));
vi.mock('@/lib/session', () => ({ getSessionUser: async () => ({ id: sessionId }) }));

const nouveau = (p: string) => (registerUser(`${p}_${Math.random().toString(36).slice(2, 8)}`, '1234') as { id: number }).id;
const patch = async (nightId: number, body: object) => {
  const { PATCH } = await import('@/app/api/nights/[id]/route');
  return PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id: String(nightId) }) });
};

describe('partie : seul le créateur gère les joueurs', () => {
  it('un participant non créateur ne peut pas changer les joueurs (403), le créateur reste', async () => {
    const marc = nouveau('c_marc'), lea = nouveau('c_lea');
    const nightId = createNight(marc, [marc, lea]);
    sessionId = lea;
    expect((await patch(nightId, { playerIds: [lea] })).status).toBe(403);
    expect(getNightPlayers(nightId).map((p) => p.id).sort()).toEqual([marc, lea].sort());
  });
  it('le créateur peut toujours modifier les joueurs', async () => {
    const marc = nouveau('c_marc'), lea = nouveau('c_lea');
    const nightId = createNight(marc, [marc, lea]);
    sessionId = marc;
    expect((await patch(nightId, { playerIds: [marc] })).status).toBe(200);
    expect(getNightPlayers(nightId).map((p) => p.id)).toEqual([marc]);
  });
  it('correction d\'une partie terminée : le créateur ne peut pas être retiré (400)', () => {
    const marc = nouveau('c_marc'), lea = nouveau('c_lea');
    const nightId = createNight(marc, [marc, lea]);
    getDb().prepare(`UPDATE nights SET status = 'termine', ended_at = datetime('now','localtime') WHERE id = ?`).run(nightId);
    expect((corrigerNuit(nightId, lea, { playerIds: [lea] }) as { status: number }).status).toBe(400);
    expect(getNightPlayers(nightId)).toHaveLength(2);
  });
});
