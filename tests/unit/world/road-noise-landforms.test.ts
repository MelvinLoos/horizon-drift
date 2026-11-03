import { describe, expect, it } from 'vitest';
import { LANDFORM_TYPES } from '../../../src/config/landforms';
import { ROAD_CORRIDOR_HALF_WIDTH } from '../../../src/config/road';
import { landformBlend, landformHeight, terrainElevation } from '../../../src/world/landforms';
import { hash2D, NOISE_PERIOD, valueNoise } from '../../../src/world/noise';
import { roadDerivativeX, roadX, roadY } from '../../../src/world/road';
import { expectLegacy, legacyFixture } from '../support/legacy';

/** Oracle tests: the extracted functions must reproduce the legacy prototype (see ORACLE_TOLERANCE). */
describe('matches the legacy prototype', () => {
  it('road curve, grade and derivative', () => {
    const rows = legacyFixture('road');
    expect(rows.length).toBeGreaterThan(400);
    for (const { z, x, y, dx } of rows) {
      expectLegacy(roadX(z), x, `roadX(${z})`);
      expectLegacy(roadY(z), y, `roadY(${z})`);
      expectLegacy(roadDerivativeX(z), dx, `roadDerivativeX(${z})`);
    }
  });

  it('lattice hash', () => {
    for (const { x, z, v } of legacyFixture('hash')) {
      expectLegacy(hash2D(x, z), v, `hash2D(${x}, ${z})`);
    }
  });

  it('value noise', () => {
    for (const { x, z, v } of legacyFixture('noise')) {
      expectLegacy(valueNoise(x, z), v, `valueNoise(${x}, ${z})`);
    }
  });

  it('landform blend', () => {
    for (const { z, ...expected } of legacyFixture('blend')) expect(landformBlend(z)).toEqual(expected);
  });

  it('per-landform height', () => {
    const rows = legacyFixture('height');
    expect(new Set(rows.map((r) => r.type)).size).toBe(LANDFORM_TYPES.length);
    for (const r of rows) {
      expectLegacy(
        landformHeight(r.type, r.worldX, r.worldZ, r.dist, r.n1, r.n2, r.n3),
        r.v,
        `type ${r.type}`,
      );
    }
  });

  it('terrain elevation', () => {
    for (const r of legacyFixture('elevation')) {
      expectLegacy(terrainElevation(r.worldX, r.worldZ, r.dist), r.v, `(${r.worldX}, ${r.worldZ})`);
    }
  });
});

describe('properties', () => {
  it('hash and noise stay in [0, 1)', () => {
    for (let i = -50; i < 50; i++) {
      const h = hash2D(i * 37, i * -91);
      const n = valueNoise(i * 1.37, i * -2.11);
      for (const v of [h, n]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    }
  });

  it('hash wraps every NOISE_PERIOD cells', () => {
    expect(hash2D(5, 9)).toBe(hash2D(5 + NOISE_PERIOD, 9 - 3 * NOISE_PERIOD));
  });

  it('keeps the road corridor flat', () => {
    for (const z of [0, -777, -123456]) {
      for (const d of [0, 5, ROAD_CORRIDOR_HALF_WIDTH]) expect(terrainElevation(roadX(z) + d, z, d)).toBe(0);
    }
  });

  it('blends between consecutive landforms with weight in [0, 1]', () => {
    for (let z = 0; z > -20000; z -= 333) {
      const { idxA, idxB, blend } = landformBlend(z);
      expect(idxB).toBe((idxA + 1) % LANDFORM_TYPES.length);
      expect(blend).toBeGreaterThanOrEqual(0);
      expect(blend).toBeLessThanOrEqual(1);
    }
  });
});
