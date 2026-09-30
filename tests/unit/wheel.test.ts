import { describe, it, expect } from 'vitest';
import { finalRotation, jitterFor, segmentAngle } from '@/lib/wheel';

describe('wheel', () => {
  it('amène le centre du segment visé sous le pointeur (mod 360)', () => {
    const count = 7;
    for (let i = 0; i < count; i++) {
      const r = finalRotation(i, count, 0);
      const seg = segmentAngle(count);
      const landed = ((r % 360) + 360) % 360;              // rotation appliquée
      const center = (i * seg + seg / 2 + landed) % 360;   // position du centre après rotation
      expect(Math.abs(center - 360) < 0.001 || center < 0.001).toBe(true);
    }
  });
  it('fait au moins 4 tours complets', () => {
    expect(finalRotation(0, 8, 0)).toBeGreaterThanOrEqual(4 * 360);
  });
  it('le jitter reste dans le segment (pas de débordement sur le voisin)', () => {
    const count = 5; const half = 180 / count - 6;
    const j = jitterFor(count);
    expect(Math.abs(j)).toBeLessThanOrEqual(half + 0.001);
  });
});
