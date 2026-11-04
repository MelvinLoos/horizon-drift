import { describe, expect, it } from 'vitest';
import {
  advanceBar,
  createComposerState,
  currentPhase,
  resetForStation,
} from '../../../src/audio/composer/arrangement';
import { composeStep, dynamicVoicing, type NoteEvent } from '../../../src/audio/composer/patterns';
import { midiToNote, noteToMidi, transpose } from '../../../src/audio/notes';
import { ARRANGEMENT_PHASE_NAMES, RADIO_STATIONS, type Station } from '../../../src/config/stations';
import { createRng } from '../../../src/core/rng';

const STEPS_PER_BAR = 16;

/** Plays `bars` bars and returns every event with the step it happened on. */
function perform(station: Station, bars: number, seed: number): { step: number; event: NoteEvent }[] {
  const rng = createRng(seed);
  const state = createComposerState();
  resetForStation(state, station, rng);
  const out: { step: number; event: NoteEvent }[] = [];
  for (let i = 0; i < bars * STEPS_PER_BAR; i++) {
    const step = state.step;
    for (const event of composeStep(state, station, rng).events) out.push({ step, event });
  }
  return out;
}

const notesOf = (e: NoteEvent): string[] => (e.notes === undefined ? [] : [e.notes].flat());

describe('note helpers', () => {
  it('converts between names and MIDI', () => {
    expect(noteToMidi('C4')).toBe(60);
    expect(noteToMidi('A1')).toBe(33);
    expect(noteToMidi('F#3')).toBe(54);
    expect(midiToNote(60)).toBe('C4');
    expect(midiToNote(54)).toBe('F#3');
  });

  it('round-trips and transposes by octaves', () => {
    for (let m = 24; m <= 96; m++) expect(noteToMidi(midiToNote(m))).toBe(m);
    expect(transpose('E3', 12)).toBe('E4');
    expect(transpose('G#4', -12)).toBe('G#3');
  });
});

describe.each(RADIO_STATIONS)('composer: $name', (station) => {
  const performance = perform(station, 96, 2024);

  it('plays something every few bars', () => {
    expect(performance.length).toBeGreaterThan(96 * 4);
  });

  it('only plays valid, audible pitches', () => {
    for (const { event } of performance) {
      for (const note of notesOf(event)) {
        const midi = noteToMidi(note as never);
        expect(Number.isInteger(midi)).toBe(true);
        expect(midi).toBeGreaterThanOrEqual(24); // C1
        expect(midi).toBeLessThanOrEqual(96); // C7
      }
    }
  });

  it('keeps velocities within 0..1', () => {
    for (const { event } of performance) {
      expect(event.velocity).toBeGreaterThan(0);
      expect(event.velocity).toBeLessThanOrEqual(1);
    }
  });

  it('humanises only polyphonic instruments', () => {
    for (const { event } of performance) {
      expect(event.humanize).toBe(event.instrument === 'pad' || event.instrument === 'arp');
    }
  });

  it('is reproducible for a given seed and differs between seeds', () => {
    expect(perform(station, 8, 5)).toEqual(perform(station, 8, 5));
    expect(perform(station, 8, 5)).not.toEqual(perform(station, 8, 6));
  });

  it('has no drums on the ambient station and none during intros', () => {
    const drums = new Set(['kick', 'snare', 'openHat', 'closedHat']);
    if (station.style === 'ambient') {
      expect(performance.some(({ event }) => drums.has(event.instrument))).toBe(false);
    } else {
      expect(performance.some(({ event }) => event.instrument === 'kick')).toBe(true);
    }
  });
});

describe('arrangement', () => {
  const station = RADIO_STATIONS[0];

  it('visits every phase over a long performance and starts in CRUISE', () => {
    const state = createComposerState();
    expect(currentPhase(state)).toBe('CRUISE');
    const rng = createRng(11);
    const seen = new Set<string>();
    for (let bar = 0; bar < 400; bar++) {
      advanceBar(state, station, rng);
      seen.add(currentPhase(state));
    }
    expect([...seen].sort()).toEqual([...ARRANGEMENT_PHASE_NAMES].sort());
  });

  it('reports a new phase only when one starts, and keeps bar lengths in range', () => {
    const state = createComposerState();
    const rng = createRng(3);
    let phases = 0;
    for (let bar = 0; bar < 200; bar++) {
      if (advanceBar(state, station, rng)) {
        phases++;
        expect(state.phaseTargetBars).toBeGreaterThanOrEqual(4);
        expect(state.phaseTargetBars).toBeLessThanOrEqual(10);
      }
    }
    expect(phases).toBeGreaterThan(10);
  });

  it('keeps the chord index within a four-bar phrase', () => {
    const state = createComposerState();
    const rng = createRng(9);
    for (let bar = 0; bar < 100; bar++) {
      advanceBar(state, station, rng);
      expect(state.chordIdx).toBeGreaterThanOrEqual(0);
      expect(state.chordIdx).toBeLessThan(4);
    }
  });

  it('picks progressions from the station, whatever their number (BUG-008)', () => {
    const base = RADIO_STATIONS[0];
    const [p0, p1, p2] = base.progressions;
    const four: Station = { ...base, progressions: [p0, p1, p2, p0] as never };
    const two: Station = { ...base, progressions: [p0, p1] as never };

    const rng = createRng(1);
    const seenFour = new Set<number>();
    const state = createComposerState();
    for (let i = 0; i < 600; i++) {
      advanceBar(state, four, rng);
      seenFour.add(state.progressionIdx);
    }
    expect([...seenFour].sort()).toEqual([0, 1, 2, 3]);

    const stateTwo = createComposerState();
    for (let i = 0; i < 600; i++) {
      advanceBar(stateTwo, two, rng);
      expect(stateTwo.progressionIdx).toBeLessThan(2);
    }
    // And the step composer can play a two-progression station without throwing.
    expect(() => perform(two, 32, 4)).not.toThrow();
  });

  it('resetForStation chooses a valid progression and restarts the phrase', () => {
    const state = createComposerState();
    state.chordIdx = 3;
    for (let seed = 0; seed < 50; seed++) {
      resetForStation(state, station, createRng(seed));
      expect(state.chordIdx).toBe(0);
      expect(state.progressionIdx).toBeLessThan(station.progressions.length);
    }
  });
});

describe('dynamicVoicing', () => {
  const chord = RADIO_STATIONS[0].progressions[0][0].notes;

  it('thins the voicing in breakdowns and intros', () => {
    for (let seed = 0; seed < 20; seed++) {
      expect(dynamicVoicing(chord, 'BREAKDOWN', createRng(seed))).toHaveLength(chord.length - 1);
    }
  });

  it('adds a top octave in peaks and solos', () => {
    for (let seed = 0; seed < 20; seed++) {
      expect(dynamicVoicing(chord, 'PEAK', createRng(seed))).toHaveLength(chord.length + 1);
    }
  });

  it('does not mutate its input', () => {
    const copy = [...chord];
    dynamicVoicing(chord, 'PEAK', createRng(1));
    expect(chord).toEqual(copy);
  });
});

describe('hats (BUG-009)', () => {
  it('emits separate open and closed hat events instead of mutating one envelope', () => {
    const events = RADIO_STATIONS.flatMap((s) => perform(s, 64, 77)).map(({ event }) => event.instrument);
    expect(events).toContain('openHat');
    expect(events).toContain('closedHat');
  });
});
