import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from 'vitest';

/** Shapes of the oracle fixtures written by scripts/capture-legacy-fixtures.ts. */
export interface LegacyFixtures {
  road: { z: number; x: number; y: number; dx: number }[];
  hash: { x: number; z: number; v: number }[];
  noise: { x: number; z: number; v: number }[];
  blend: { z: number; idxA: number; idxB: number; blend: number; activeName: string }[];
  height: {
    type: number;
    worldX: number;
    worldZ: number;
    dist: number;
    n1: number;
    n2: number;
    n3: number;
    v: number;
  }[];
  elevation: { worldX: number; worldZ: number; dist: number; v: number }[];
  celestial: {
    p: number;
    phaseLabel: string;
    nightFactor: number;
    celestialDir: [number, number, number];
    isMoon: number;
    bodyOpacity: number;
    starOpacity: number;
    dirIntensity: number;
    hemiIntensity: number;
  }[];
}

/** Loads an oracle fixture captured from the legacy prototype. */
export function legacyFixture<K extends keyof LegacyFixtures>(name: K): LegacyFixtures[K] {
  const file = join(import.meta.dirname, '..', '..', 'fixtures', 'legacy', `${name}.json`);
  return (JSON.parse(readFileSync(file, 'utf8')) as { data: LegacyFixtures[K] }).data;
}

/**
 * Relative tolerance for oracle comparisons. Fixtures come from Chromium, tests run in Node: their
 * V8 builds use different trig routines (Chrome: `use_libm_trig_functions`), so Math.sin/cos can
 * differ by 1 ulp, which the noise hash (×43758) amplifies to ~1e-11. See ADR-0003.
 */
export const ORACLE_TOLERANCE = 1e-9;

/** Asserts `actual` equals the legacy value within ORACLE_TOLERANCE (relative, absolute below 1). */
export function expectLegacy(actual: number, expected: number, context = ''): void {
  const tolerance = ORACLE_TOLERANCE * Math.max(1, Math.abs(expected));
  const message = `${context} expected ${expected}, got ${actual}`;
  expect(Math.abs(actual - expected) <= tolerance, message).toBe(true);
}
