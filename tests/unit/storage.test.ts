import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { saveBugCapture, isSafeCaptureName, bugCapturePath } from '@/lib/storage';

describe('captures de bugs (DATA_DIR/bugs)', () => {
  it('sauvegarde avec un nom uuid sûr, dans DATA_DIR/bugs', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const name = saveBugCapture(png);
    expect(isSafeCaptureName(name)).toBe(true);
    const p = bugCapturePath(name);
    expect(p.startsWith(process.env.DATA_DIR!)).toBe(true);
    expect(fs.readFileSync(p).equals(png)).toBe(true);
  });
  it('rejette les noms dangereux : traversée, ext exotique, casse, nom trop long', () => {
    for (const n of ['../../etc/passwd.png', 'a.png.exe', 'A-UUID.PNG', '', '.png', `${'a'.repeat(80)}.png`])
      expect(isSafeCaptureName(n)).toBe(false);
  });
});
