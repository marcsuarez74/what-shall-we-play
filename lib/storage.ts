import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from './db';

const COVERS_DIR = path.join(DATA_DIR, 'covers');
export const COVER_EXT = ['jpg', 'jpeg', 'png', 'webp'] as const;
export type CoverExt = (typeof COVER_EXT)[number];

export function isSafeCoverName(name: string): boolean {
  return /^[a-z0-9-]+\.(jpg|jpeg|png|webp)$/.test(name);
}
export function saveCover(buf: Buffer, ext: CoverExt): string {
  fs.mkdirSync(COVERS_DIR, { recursive: true });
  const name = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(COVERS_DIR, name), buf);
  return name;
}
export function coverPathOnDisk(name: string): string {
  return path.join(COVERS_DIR, path.basename(name));
}
