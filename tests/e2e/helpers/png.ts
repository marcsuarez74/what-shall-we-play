import zlib from 'node:zlib';

// PNG pur Node (dégradé R=x, G=y, B=128) — pour les tests d'images.
export function makePng(w: number, h: number): Buffer {
  const bpp = 3;
  const rowSize = 1 + w * bpp;
  const raw = Buffer.alloc(rowSize * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = y * rowSize + 1 + x * bpp;
      raw[o] = Math.round((x * 255) / Math.max(1, w - 1));
      raw[o + 1] = Math.round((y * 255) / Math.max(1, h - 1));
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

// Même image sous forme de File (upload multipart) — copie dans un ArrayBuffer
// frais pour satisfaire BlobPart côté TS.
export function pngFile(w = 8, h = 8): File {
  const buf = makePng(w, h);
  const u8 = new Uint8Array(buf.byteLength);
  u8.set(buf);
  return new File([u8], 'cover.png', { type: 'image/png' });
}
