import { describe, it, expect } from 'vitest';
import { cropBase, cropDisplaySize, cropSourceRect, clampCropOffset, CROP_SQ } from '@/lib/crop';

describe('math de recadrage carré', () => {
  it('portrait 3000×4000 : affiché en cover (320 de large), jamais à la taille naturelle', () => {
    expect(cropBase(3000, 4000)).toBeCloseTo(320 / 3000, 10);
    const { w, h } = cropDisplaySize(3000, 4000, 1);
    expect(w).toBeCloseTo(320, 6);           // ≤ zone, PAS 3000
    expect(h).toBeCloseTo(426.6667, 3);      // le grand côté déborde, on recadre
  });

  it('zoom 1 = cadré juste ; les offsets sont bornés pour ne jamais découvrir le fond', () => {
    // à zoom 1 sur la largeur (portrait) : x figé, y peut glisser de (426.67-320)/2
    const c0 = clampCropOffset(3000, 4000, 1, -50, 0);
    expect(Math.abs(c0.x)).toBe(0); // Math.max peut renvoyer -0
    expect(Math.abs(c0.y)).toBe(0);
    const limY = (4000 * (320 / 3000) - CROP_SQ) / 2;
    expect(clampCropOffset(3000, 4000, 1, 0, 500).y).toBeCloseTo(limY, 6);
    expect(clampCropOffset(3000, 4000, 1, 0, -500).y).toBeCloseTo(-limY, 6);
    // zoom 3 : les deux axes glissent
    const at3 = clampCropOffset(3000, 4000, 3, 9999, -9999);
    expect(at3.x).toBeCloseTo((3000 * (320 / 3000) * 3 - CROP_SQ) / 2, 6);
    expect(at3.y).toBeCloseTo(-(4000 * (320 / 3000) * 3 - CROP_SQ) / 2, 6);
  });

  it('rect source : ce que montre le carré est ce qui est enregistré (centre par défaut)', () => {
    // portrait, zoom 1, offset 0 → pleine largeur, bande verticale centrale [500..3500]
    const r = cropSourceRect(3000, 4000, 1, 0, 0);
    expect(r.sx).toBeCloseTo(0, 6);
    expect(r.sw).toBeCloseTo(3000, 6);
    expect(r.sy).toBeCloseTo(500, 6);
    expect(r.sh).toBeCloseTo(3000, 6);
    // offset y min (-limY : on glisse vers le haut) → la bande atteint le bas de l'image
    const limY = (4000 * (320 / 3000) - CROP_SQ) / 2;
    const rb = cropSourceRect(3000, 4000, 1, 0, -limY);
    expect(rb.sy + rb.sh).toBeCloseTo(4000, 6);
  });

  it('paysage 4000×3000 et carré : symétrique, aucune taille naturelle affichée', () => {
    const { w, h } = cropDisplaySize(4000, 3000, 1);
    expect(w).toBeCloseTo(426.6667, 3);
    expect(h).toBeCloseTo(320, 6);
    const rs = cropSourceRect(1000, 1000, 1, 0, 0);
    expect(rs.sw).toBeCloseTo(1000, 6);
    expect(rs.sh).toBeCloseTo(1000, 6);
    expect(rs.sx).toBeCloseTo(0, 6);
  });
});
