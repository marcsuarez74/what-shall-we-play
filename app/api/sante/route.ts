// app/api/sante/route.ts — sonde de santé (HEALTHCHECK Docker, v4.7.4) :
// le serveur répond et la base SQLite est lisible.
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export function GET() {
  try {
    getDb().prepare('SELECT 1').get();
    return new Response('ok', { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return new Response('base indisponible', { status: 503 });
  }
}
