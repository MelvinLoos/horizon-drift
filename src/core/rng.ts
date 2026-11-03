/** A random number source returning floats in [0, 1), like `Math.random`. */
export type Rng = () => number;

/**
 * Seeded mulberry32 PRNG. Every random draw in the app goes through an `Rng`, so tests can make
 * procedural content and the generative radio reproducible.
 */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform integer in [0, maxExclusive). */
export function randomInt(rng: Rng, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive);
}

/** Uniformly picks an element of a non-empty array (first one if `rng` ever returns 1). */
export function pick<T>(rng: Rng, items: readonly [T, ...T[]]): T {
  return items[randomInt(rng, items.length)] ?? items[0];
}
