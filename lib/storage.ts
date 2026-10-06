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
// v4.7.2 (audit, point 8) — le format d'une image se lit dans ses premiers octets,
// jamais dans le nom de fichier fourni : un « .jpg » qui n'est pas une image est refusé,
// et l'extension enregistrée est la vraie (le Content-Type servi en découle).
export function formatImage(buf: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}
function formatOuErreur(buf: Buffer): CoverExt {
  const f = formatImage(buf);
  if (!f) throw new Error('image non reconnue (jpeg, png ou webp attendu)');
  return f;
}
export function saveCover(buf: Buffer): string {
  const ext = formatOuErreur(buf);
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
export function saveBugCapture(buf: Buffer): string {
  const ext = formatOuErreur(buf);
  fs.mkdirSync(BUGS_DIR, { recursive: true });
  const name = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(BUGS_DIR, name), buf);
  return name;
}
export function bugCapturePath(name: string): string {
  return path.join(BUGS_DIR, path.basename(name));
}
