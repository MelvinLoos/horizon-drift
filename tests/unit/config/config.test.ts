import { describe, expect, it } from 'vitest';
import { BIOMES, PALETTE_KEYS, SCENERY_TYPES } from '../../../src/config/biomes';
import { CAMERA_MODES } from '../../../src/config/cameras';
import { CELESTIAL_PALETTE } from '../../../src/config/celestial';
import { LANDFORM_TYPES, ZONE_LENGTH } from '../../../src/config/landforms';
import {
  ARRANGEMENT_PHASE_NAMES,
  ARRANGEMENT_PHASES,
  RADIO_STATIONS,
  STATION_STYLES,
  type NoteName,
} from '../../../src/config/stations';
import { SEGMENT_LEN, TOTAL_LENGTH, Z_SEGMENTS } from '../../../src/config/world';

const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** MIDI number of a note name (C4 = 60). */
function midi(note: NoteName): number {
  const match = /^([A-G])(#?)(\d)$/.exec(note);
  if (!match) throw new Error(`bad note ${note}`);
  const [, letter = '', sharp, octave = ''] = match;
  return (Number(octave) + 1) * 12 + (SEMITONES[letter] ?? NaN) + (sharp ? 1 : 0);
}

const isHex24 = (n: number) => Number.isInteger(n) && n >= 0 && n <= 0xffffff;
const isCssHex = (s: string) => /^#[0-9a-f]{6}$/.test(s);
const unique = (xs: readonly unknown[]) => new Set(xs).size === xs.length;

describe('biomes', () => {
  it('has five uniquely named biomes', () => {
    expect(BIOMES).toHaveLength(5);
    expect(unique(BIOMES.map((b) => b.name))).toBe(true);
  });

  it.each(BIOMES)('$name has a complete, valid palette', (biome) => {
    expect(Object.keys(biome.palette).sort()).toEqual([...PALETTE_KEYS].sort());
    for (const value of Object.values(biome.palette)) expect(isHex24(value)).toBe(true);
    expect(isCssHex(biome.dotColor)).toBe(true);
    expect(SCENERY_TYPES).toContain(biome.sceneryType);
    expect(biome.sunElevation).toBeGreaterThan(0);
    expect(biome.sunElevation).toBeLessThan(1);
  });
});

describe('radio stations', () => {
  it('have unique frequencies and names', () => {
    expect(unique(RADIO_STATIONS.map((s) => s.freq))).toBe(true);
    expect(unique(RADIO_STATIONS.map((s) => s.name))).toBe(true);
  });

  it.each(RADIO_STATIONS)('$name is well-formed', (station) => {
    expect(STATION_STYLES).toContain(station.style);
    expect(isCssHex(station.color)).toBe(true);
    expect(station.bpm).toBeGreaterThanOrEqual(40);
    expect(station.bpm).toBeLessThanOrEqual(200);
    expect(station.freq).toMatch(/^\d{2,3}\.\d FM$/);
  });

  it.each(RADIO_STATIONS)('$name has a strictly ascending 15-note scale', ({ scale }) => {
    expect(scale).toHaveLength(15);
    const pitches = scale.map(midi);
    for (let i = 1; i < pitches.length; i++) expect(pitches[i]).toBeGreaterThan(pitches[i - 1] ?? Infinity);
  });

  it.each(RADIO_STATIONS)('$name chords are bass-ordered and voiced low to high', ({ progressions }) => {
    // The composer indexes progressions 0..2 when it branches between them.
    expect(progressions).toHaveLength(3);
    for (const progression of progressions) {
      for (const chord of progression) {
        // The bass line's fifth: diminished (e.g. B half-diminished), perfect or augmented. Jazz
        // voicings (lo-fi) may omit it from `notes`, so only the interval is checked.
        expect([6, 7, 8]).toContain(midi(chord.fifth) - midi(chord.root));
        expect(midi(chord.octave) - midi(chord.root)).toBe(12);
        expect(chord.notes.length).toBeGreaterThanOrEqual(5);
        const voicing = chord.notes.map(midi);
        for (let i = 1; i < voicing.length; i++)
          expect(voicing[i]).toBeGreaterThan(voicing[i - 1] ?? Infinity);
      }
    }
  });

  it('arrangement only uses known phases and starts in INTRO', () => {
    expect(ARRANGEMENT_PHASES[0]).toBe('INTRO');
    for (const phase of ARRANGEMENT_PHASES) expect(ARRANGEMENT_PHASE_NAMES).toContain(phase);
  });
});

describe('world, landforms, cameras, sky', () => {
  it('derives the mesh length from its segments', () => {
    expect(TOTAL_LENGTH).toBe(Z_SEGMENTS * SEGMENT_LEN);
  });

  it('has six unique landforms and a positive zone length', () => {
    expect(LANDFORM_TYPES).toHaveLength(6);
    expect(unique(LANDFORM_TYPES.map((l) => l.id))).toBe(true);
    expect(ZONE_LENGTH).toBeGreaterThan(0);
  });

  it('has three camera modes', () => {
    expect(CAMERA_MODES).toEqual(['Chase Cam', 'Bonnet View', 'Cinema Drone']);
  });

  it('has valid celestial anchor colours', () => {
    for (const value of Object.values(CELESTIAL_PALETTE)) expect(isHex24(value)).toBe(true);
  });
});
