import { describe, it, expect } from 'vitest';

describe('outillage', () => {
  it('vitest tourne et DATA_DIR est isolé', () => {
    expect(process.env.DATA_DIR).toContain('.tmp-vitest');
  });
});
