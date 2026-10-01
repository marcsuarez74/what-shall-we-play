import { test, expect } from '@playwright/test';
import zlib from 'node:zlib';

// PNG 1200×1600 (portrait, comme une photo de téléphone) — dégradé R=x, G=y, B=128.
// Le dégradé permet de vérifier QUELLE partie de l'image a été recadrée.
function makePhoto(w: number, h: number): Buffer {
  const bpp = 3;
  const rowSize = 1 + w * bpp;
  const raw = Buffer.alloc(rowSize * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = y * rowSize + 1 + x * bpp;
      raw[o] = Math.round((x * 255) / (w - 1));
      raw[o + 1] = Math.round((y * 255) / (h - 1));
      raw[o + 2] = 128;
    }
  }
  const crcTable: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc32 = (b: Buffer) => {
    let c = 0xffffffff;
    for (const byte of b) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const t = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8 bits, RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function registerAndStart(page: import('@playwright/test').Page, pseudo: string) {
  await page.goto('/register');
  await page.getByLabel('Pseudo').fill(pseudo);
  await page.getByLabel('Code secret').fill('1234');
  const reg = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await reg;
  const nightDone = page.waitForResponse((r) => r.url().endsWith('/api/nights') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Créer la partie' }).click();
  await nightDone;
  await page.waitForURL('/etagere');
}

async function pickPhoto(page: import('@playwright/test').Page, png: Buffer) {
  await page.getByRole('button', { name: "Changer d'avatar" }).click();
  await page.locator('input[type=file]').nth(1)
    .setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByRole('dialog', { name: 'Recadrer ta photo' })).toBeVisible();
}

test('les inputs caméra/galerie restent rendus (iOS : display:none casse le click programmatique)', async ({ page }) => {
  const pseudo = `iosin-${Date.now()}`;
  await registerAndStart(page, pseudo);
  await page.goto('/profil');
  await page.getByRole('button', { name: "Changer d'avatar" }).click();
  const display = await page.locator('input[type=file]').first()
    .evaluate((el) => getComputedStyle(el).display);
  expect(display).not.toBe('none'); // ROUGE avant fix (attribut hidden)
});

test('recadrage : cadré juste dès le départ, fiable à chaque prise, avatar conforme', async ({ page }) => {
  const pseudo = `crop-${Date.now()}`;
  await registerAndStart(page, pseudo);
  await page.goto('/profil');
  const png = makePhoto(1200, 1600);

  // 1re prise — le zoom minimum montre l'image « cover » (320 de large), PAS la taille naturelle
  await pickPhoto(page, png);
  const nat = await page.evaluate(() => document.querySelector<HTMLImageElement>('.crop-sq img')?.naturalWidth);
  expect(nat).toBe(1200); // sanity : on teste bien une grande photo
  const box = await page.locator('.crop-sq img').boundingBox();
  expect(box?.width ?? 9999).toBeLessThanOrEqual(321); // ROUGE avant fix : ~1200 (zoom ×4)

  // Le bouton attend que l'image soit décodée (pas de « Recadrer » sur une image vide)
  await expect(page.getByRole('button', { name: 'Recadrer ✓' })).toBeEnabled();
  const post = page.waitForResponse((r) => r.url().endsWith('/api/me/avatar') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Recadrer ✓' }).click();
  await post;
  await expect(page.getByRole('dialog', { name: 'Recadrer ta photo' })).toHaveCount(0);

  // L'avatar enregistré : 256×256, non vide, et la BONNE région (bande centrale, pleine largeur)
  await page.reload();
  const src = await page.locator('.avatar img').getAttribute('src');
  expect(src).toBeTruthy();
  const info = await page.evaluate(async (s) => {
    const r = await fetch(s as string);
    const bmp = await createImageBitmap(await r.blob());
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    const px = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3));
    const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    let mn = 255, mx = 0;
    for (let i = 0; i < d.length; i += 4) { mn = Math.min(mn, d[i]); mx = Math.max(mx, d[i]); }
    return { w: bmp.width, h: bmp.height, spread: mx - mn, tl: px(3, 3), tr: px(bmp.width - 4, 3) };
  }, src);
  expect(info.w).toBe(256);
  expect(info.h).toBe(256);
  expect(info.spread).toBeGreaterThan(8); // pas une image noire/vide
  // Bande centrale pleine largeur : R ≈ x → coins gauche clair-foncé, droite claire
  expect(info.tl[0]).toBeLessThan(40);   // ROUGE avant fix : ~90 (mauvaise région)
  expect(info.tr[0]).toBeGreaterThan(215);

  // 2e prise avec le même fichier — le flow doit marcher À CHAQUE FOIS
  await pickPhoto(page, png);
  await expect(page.getByRole('button', { name: 'Recadrer ✓' })).toBeEnabled();
  const post2 = page.waitForResponse((r) => r.url().endsWith('/api/me/avatar') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Recadrer ✓' }).click();
  await post2;
  await expect(page.getByRole('dialog', { name: 'Recadrer ta photo' })).toHaveCount(0);
});
