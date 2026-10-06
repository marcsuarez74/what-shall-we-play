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
// v4.7.3 (audit, point 10) — une pochette s'affiche dans ~100 px : elle est réduite
// à l'enregistrement (400 px max, webp). Si sharp ne sait pas la décoder, l'original
// est gardé (son format a déjà été vérifié) : l'ajout ne casse jamais pour ça.
export const COTE_MAX = 400;
// sharp (binaire natif) est chargé à la demande : s'il manquait dans l'image Docker,
// les pochettes resteraient servies et enregistrées — simplement pas réduites.
async function chargerSharp() {
  try { return (await import('sharp')).default; } catch { return null; }
}
export async function reduireImage(buf: Buffer): Promise<Buffer | null> {
  const sharp = await chargerSharp();
  if (!sharp) return null;
  try {
    return await sharp(buf).rotate()
      .resize({ width: COTE_MAX, height: COTE_MAX, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 }).toBuffer();
  } catch { return null; }
}
export async function saveCover(buf: Buffer): Promise<string> {
  const original = formatOuErreur(buf);
  const reduite = await reduireImage(buf);
  fs.mkdirSync(COVERS_DIR, { recursive: true });
  const name = `${crypto.randomUUID()}.${reduite ? 'webp' : original}`;
  fs.writeFileSync(path.join(COVERS_DIR, name), reduite ?? buf);
  return name;
}

// v4.7.3 — les pochettes enregistrées avant la réduction sont réduites une fois, en
// place (même nom, même format : aucune donnée en base ne change). Lancé au démarrage
// du serveur (instrumentation.ts), en tâche de fond ; un fichier témoin évite de recommencer.
const SEUIL_OCTETS = 150 * 1024;
export async function reduirePochettesExistantes(): Promise<number> {
  const temoin = path.join(COVERS_DIR, '.reduites-v1');
  if (!fs.existsSync(COVERS_DIR) || fs.existsSync(temoin)) return 0;
  const sharp = await chargerSharp();
  if (!sharp) return 0; // pas de témoin : on réessaiera au prochain démarrage
  let n = 0;
  for (const nom of fs.readdirSync(COVERS_DIR)) {
    if (!isSafeCoverName(nom)) continue;
    const p = path.join(COVERS_DIR, nom);
    if (fs.statSync(p).size <= SEUIL_OCTETS) continue;
    try {
      const ext = nom.split('.').pop();
      const img = sharp(fs.readFileSync(p)).rotate()
        .resize({ width: COTE_MAX, height: COTE_MAX, fit: 'inside', withoutEnlargement: true });
      const sortie = ext === 'png' ? await img.png().toBuffer() : ext === 'webp' ? await img.webp({ quality: 80 }).toBuffer() : await img.jpeg({ quality: 80 }).toBuffer();
      if (sortie.length < fs.statSync(p).size) { fs.writeFileSync(p, sortie); n++; }
    } catch { /* image illisible : laissée telle quelle */ }
  }
  fs.writeFileSync(temoin, new Date().toISOString());
  return n;
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
