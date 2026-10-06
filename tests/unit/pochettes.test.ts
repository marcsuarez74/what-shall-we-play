import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { saveCover, coverPathOnDisk, reduirePochettesExistantes, COTE_MAX } from '@/lib/storage';

// v4.7.3 (audit, point 10) — pochettes réduites à 400 px (webp) à l'enregistrement,
// et réduction unique, en place, des pochettes déjà stockées.
const bruit = (w: number, h: number) =>
  sharp(crypto.randomBytes(w * h * 3), { raw: { width: w, height: h, channels: 3 } });

describe('réduction des pochettes', () => {
  it('une grande image est enregistrée en webp de 400 px maximum', async () => {
    const jpg = await bruit(1200, 900).jpeg().toBuffer();
    const nom = await saveCover(jpg);
    expect(nom).toMatch(/\.webp$/);
    const meta = await sharp(fs.readFileSync(coverPathOnDisk(nom))).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width!, meta.height!)).toBe(COTE_MAX);
  });

  it('une petite image n’est pas agrandie', async () => {
    const png = await bruit(120, 80).png().toBuffer();
    const meta = await sharp(fs.readFileSync(coverPathOnDisk(await saveCover(png)))).metadata();
    expect([meta.width, meta.height]).toEqual([120, 80]);
  });

  it('les pochettes existantes trop lourdes sont réduites en place, une seule fois', async () => {
    const dossier = path.dirname(coverPathOnDisk('x.png'));
    fs.mkdirSync(dossier, { recursive: true });
    fs.rmSync(path.join(dossier, '.reduites-v1'), { force: true });
    const nom = `${crypto.randomUUID()}.png`;
    fs.writeFileSync(path.join(dossier, nom), await bruit(1000, 1000).png().toBuffer());
    const avant = fs.statSync(path.join(dossier, nom)).size;
    expect(avant).toBeGreaterThan(150 * 1024);
    expect(await reduirePochettesExistantes()).toBeGreaterThanOrEqual(1);
    const apres = await sharp(fs.readFileSync(path.join(dossier, nom))).metadata();
    expect(apres.format).toBe('png'); // même nom, même format : rien ne change en base
    expect(Math.max(apres.width!, apres.height!)).toBe(COTE_MAX);
    expect(await reduirePochettesExistantes()).toBe(0); // témoin posé : pas de second passage
  });
});
