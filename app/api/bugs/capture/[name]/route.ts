// GET : sert une capture jointe à une issue. Public (GitHub doit l'afficher)
// mais le nom est un uuid v4 non devinable — regex stricte, jamais de
// traversée hors DATA_DIR/bugs.
import fs from 'node:fs';
import { NextResponse } from 'next/server';
import { isSafeCaptureName, bugCapturePath } from '@/lib/storage';

const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const name = (await params).name;
  if (!isSafeCaptureName(name)) return new NextResponse('Not found', { status: 404 });
  const p = bugCapturePath(name);
  if (!fs.existsSync(p)) return new NextResponse('Not found', { status: 404 });
  const ext = name.split('.').pop() as string;
  return new NextResponse(fs.readFileSync(p), {
    headers: { 'Content-Type': MIME[ext], 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
}
