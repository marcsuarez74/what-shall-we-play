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

// v3.4 — captures jointes aux signalements : dossier séparé, nom = uuid v4
// (regex stricte : l'URL de service est publique, elle ne doit rien traverser).
const BUGS_DIR = path.join(DATA_DIR, 'bugs');
const UUID_FILE_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(jpg|jpeg|png|webp)$/;
export function isSafeCaptureName(name: string): boolean {
  return UUID_FILE_RE.test(name);
}
export function saveBugCapture(buf: Buffer, ext: CoverExt): string {
  fs.mkdirSync(BUGS_DIR, { recursive: true });
  const name = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(BUGS_DIR, name), buf);
  return name;
}
export function bugCapturePath(name: string): string {
  return path.join(BUGS_DIR, path.basename(name));
}
