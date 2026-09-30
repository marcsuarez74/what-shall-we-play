import { describe, it, expect } from 'vitest';
import { FORMATS, FORMAT_SCALE, coverSrc } from '@/lib/formats';

describe('formats', () => {
  it('échelle décroissante grand -> mini', () => {
    expect(FORMATS).toEqual(['grand', 'moyen', 'petit', 'mini']);
    expect(FORMAT_SCALE.grand).toBe(1);
    expect(FORMAT_SCALE.mini).toBeLessThan(FORMAT_SCALE.petit);
  });
  it('coverSrc : fichier local prioritaire, sinon URL BGG, sinon null', () => {
    expect(coverSrc({ cover_path: 'a.jpg', cover_url: 'http://x' })).toBe('/api/cover/a.jpg');
    expect(coverSrc({ cover_path: null, cover_url: 'http://x' })).toBe('http://x');
    expect(coverSrc({ cover_path: null, cover_url: null })).toBeNull();
  });
});
