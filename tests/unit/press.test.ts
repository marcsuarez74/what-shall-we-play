import { describe, it, expect, vi, afterEach } from 'vitest';
import { LongPress, LONG_PRESS_MS } from '@/lib/press';

afterEach(() => vi.useRealTimers());

describe('LongPress (sélection par appui maintenu)', () => {
  it('déclenche le rappel après 400 ms de maintien', () => {
    vi.useFakeTimers();
    const fire = vi.fn();
    const p = new LongPress(fire);
    p.down(10, 10, 0);
    vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    expect(fire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it('tolère les micro-mouvements (< 10 px), annule sur un vrai glisser', () => {
    vi.useFakeTimers();
    const fire = vi.fn();
    const p = new LongPress(fire);
    p.down(100, 100, 0);
    p.move(105, 103); // dérive du doigt
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(fire).toHaveBeenCalledTimes(1);

    const p2 = new LongPress(fire);
    p2.down(100, 100, 0);
    p2.move(130, 100); // glisser → scroll
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(fire).toHaveBeenCalledTimes(1); // toujours 1 : p2 annulé
  });

  it('pointerup avant la fin annule (appui simple = fiche, pas sélection)', () => {
    vi.useFakeTimers();
    const fire = vi.fn();
    const p = new LongPress(fire);
    p.down(0, 0, 0);
    p.up();
    vi.advanceTimersByTime(LONG_PRESS_MS + 100);
    expect(fire).not.toHaveBeenCalled();
  });

  it('un cancel tardif du navigateur reste un long press (WebKit promeut le toucher en geste natif)', () => {
    vi.useFakeTimers();
    const fire = vi.fn();
    const p = new LongPress(fire);
    p.down(0, 0, 0);
    vi.advanceTimersByTime(320); // le doigt tenait depuis 320 ms
    expect(p.cancelAsPress(320)).toBe(true);
    expect(fire).toHaveBeenCalledTimes(1);
    // et pas de double déclenchement si le timer traîne encore
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it('un cancel précoce reste un appui simple (pas de sélection accidentelle)', () => {
    vi.useFakeTimers();
    const fire = vi.fn();
    const p = new LongPress(fire);
    p.down(0, 0, 0);
    vi.advanceTimersByTime(80);
    expect(p.cancelAsPress(80)).toBe(false);
    expect(fire).not.toHaveBeenCalled();
  });

  it('idempotent : pointerdown + touchstart (même toucher, deux APIs) ne doublent pas le timer', () => {
    vi.useFakeTimers();
    const fire = vi.fn();
    const p = new LongPress(fire);
    p.down(0, 0, 0);
    expect(p.active).toBe(true);
    p.down(0, 0, 0); // le fallback touch retombe sur le même timer
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it('après un long press, un nouvel appui repart proprement', () => {
    vi.useFakeTimers();
    const fire = vi.fn();
    const p = new LongPress(fire);
    p.down(0, 0, 0);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(fire).toHaveBeenCalledTimes(1);
    p.down(5, 5, 500);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(fire).toHaveBeenCalledTimes(2);
  });
});
