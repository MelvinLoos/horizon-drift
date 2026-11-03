import { smoothstep01 } from '../core/math';

/**
 * Lattice coordinates wrap at this period before hashing, so precision does not degrade at large
 * distances (the sin-based hash loses entropy for big arguments). Terrain noise therefore repeats
 * every `NOISE_PERIOD` lattice cells.
 */
export const NOISE_PERIOD = 2048;

/** Deterministic pseudo-random value in [0, 1) for a lattice point. */
export function hash2D(x: number, z: number): number {
  const px = ((x % NOISE_PERIOD) + NOISE_PERIOD) % NOISE_PERIOD;
  const pz = ((z % NOISE_PERIOD) + NOISE_PERIOD) % NOISE_PERIOD;
  const h = Math.sin(px * 127.1 + pz * 311.7) * 43758.5453123;
  return h - Math.floor(h);
}

/** Smooth 2D value noise in [0, 1): bilinear blend of lattice hashes with smoothstep weights. */
export function valueNoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const ux = smoothstep01(x - ix);
  const uz = smoothstep01(z - iz);
  const a = hash2D(ix, iz);
  const b = hash2D(ix + 1, iz);
  const c = hash2D(ix, iz + 1);
  const d = hash2D(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
