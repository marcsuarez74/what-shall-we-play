import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { saveBugCapture, isSafeCaptureName, bugCapturePath } from '@/lib/storage';

describe('captures de bugs (DATA_DIR/bugs)', () => {
  it('sauvegarde avec un nom uuid sûr, dans DATA_DIR/bugs', () => {
    const name = saveBugCapture(Buffer.from('png-fake'), 'png');
    expect(isSafeCaptureName(name)).toBe(true);
    const p = bugCapturePath(name);
    expect(p.startsWith(process.env.DATA_DIR!)).toBe(true);
    expect(fs.readFileSync(p).toString()).toBe('png-fake');
  });
  it('rejette les noms dangereux : traversée, ext exotique, casse, nom trop long', () => {
    for (const n of ['../../etc/passwd.png', 'a.png.exe', 'A-UUID.PNG', '', '.png', `${'a'.repeat(80)}.png`])
      expect(isSafeCaptureName(n)).toBe(false);
  });
});
