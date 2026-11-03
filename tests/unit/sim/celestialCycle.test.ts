import { describe, expect, it } from 'vitest';
import { advanceCelestialTime, celestialLighting, celestialState } from '../../../src/sim/celestialCycle';
import { expectLegacy, legacyFixture } from '../support/legacy';

describe('celestial cycle matches the legacy prototype', () => {
  const frames = legacyFixture('celestial');

  it('covers the whole cycle', () => {
    expect(frames).toHaveLength(100);
    expect(new Set(frames.map((f) => f.phaseLabel)).size).toBe(8);
  });

  it.each(frames)('p = $p', (f) => {
    const state = celestialState(f.p);
    const light = celestialLighting(state);
    expect(state.phaseLabel).toBe(f.phaseLabel);
    expect(state.isMoon).toBe(f.isMoon);
    expectLegacy(state.bodyOpacity, f.bodyOpacity, 'bodyOpacity');
    expectLegacy(light.nightFactor, f.nightFactor, 'nightFactor');
    expectLegacy(light.starOpacity, f.starOpacity, 'starOpacity');
    expectLegacy(light.sunIntensity, f.dirIntensity, 'sunIntensity');
    expectLegacy(light.hemiIntensity, f.hemiIntensity, 'hemiIntensity');
    light.celestialDir.forEach((v, i) => {
      expectLegacy(v, f.celestialDir[i] ?? NaN, `celestialDir[${i}]`);
    });
  });
});

describe('celestial cycle properties', () => {
  it('weights always sum to 1', () => {
    for (let i = 0; i < 1000; i++) {
      const { golden, day, twilight, night } = celestialState(i / 1000).weights;
      expect(golden + day + twilight + night).toBeCloseTo(1, 12);
    }
  });

  it('wraps the phase at 1', () => {
    expect(advanceCelestialTime(0.99, 2, 0.01)).toBeCloseTo(0.01, 12);
    expect(advanceCelestialTime(0.2, 0, 0.5)).toBe(0.2);
    expect(advanceCelestialTime(0.05, 1, -0.1)).toBeCloseTo(0.95, 12);
  });
});
