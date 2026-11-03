import { describe, expect, it } from 'vitest';
import { clamp, saturate, smoothstep01 } from '../../../src/core/math';
import { createRng, pick, randomInt } from '../../../src/core/rng';

describe('math', () => {
  it('clamps', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.3, 0, 1)).toBe(0.3);
    expect(saturate(1.5)).toBe(1);
  });

  it('smoothstep01 is 0, ½, 1 at 0, ½, 1 and symmetric', () => {
    expect(smoothstep01(0)).toBe(0);
    expect(smoothstep01(0.5)).toBe(0.5);
    expect(smoothstep01(1)).toBe(1);
    expect(smoothstep01(0.2) + smoothstep01(0.8)).toBeCloseTo(1, 12);
  });
});

describe('rng', () => {
  it('is reproducible per seed and differs between seeds', () => {
    const a = createRng(42);
    const b = createRng(42);
    const c = createRng(43);
    const seqA = Array.from({ length: 20 }, a);
    expect(Array.from({ length: 20 }, b)).toEqual(seqA);
    expect(Array.from({ length: 20 }, c)).not.toEqual(seqA);
  });

  it('produces roughly uniform values in [0, 1)', () => {
    const rng = createRng(7);
    const values = Array.from({ length: 10_000 }, rng);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
  });

  it('draws integers and picks within bounds', () => {
    const rng = createRng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const n = randomInt(rng, 5);
      expect(Number.isInteger(n) && n >= 0 && n < 5).toBe(true);
      seen.add(n);
    }
    expect(seen.size).toBe(5);
    expect(['a', 'b', 'c']).toContain(pick(rng, ['a', 'b', 'c']));
  });

  it('pick falls back to the first item if an rng breaks its [0, 1) contract', () => {
    expect(pick(() => 1, ['first', 'second'])).toBe('first');
  });
});
