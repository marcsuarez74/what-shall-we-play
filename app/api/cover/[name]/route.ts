// app/api/cover/[name]/route.ts
import fs from 'node:fs';
import { NextResponse } from 'next/server';
import { isSafeCoverName, coverPathOnDisk } from '@/lib/storage';

const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const name = (await params).name;
  if (!isSafeCoverName(name)) return new NextResponse('Not found', { status: 404 });
  const p = coverPathOnDisk(name);
  if (!fs.existsSync(p)) return new NextResponse('Not found', { status: 404 });
  const ext = name.split('.').pop() as string;
  return new NextResponse(fs.readFileSync(p), {
    headers: { 'Content-Type': MIME[ext], 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
}
