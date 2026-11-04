import { randomInt, type Rng } from '../../core/rng';
import type { ArrangementPhase, Chord, NoteName, Station } from '../../config/stations';
import { transpose } from '../notes';
import { advanceBar, currentPhase, type ComposerState } from './arrangement';

export type Instrument = 'pad' | 'bass' | 'arp' | 'lead' | 'kick' | 'snare' | 'openHat' | 'closedHat';

/** One note or drum hit for the engine to play. Time is the step's time plus `offset` seconds. */
export interface NoteEvent {
  readonly instrument: Instrument;
  /** Pitched instruments only; drums are unpitched except the kick's fixed pitch. */
  readonly notes?: NoteName | readonly NoteName[];
  /** Tone.js duration, e.g. `16n`, `2n.`, `1m`. */
  readonly duration: string;
  /** 0..1 */
  readonly velocity: number;
  /** Polyphonic instruments get a tiny random delay for a human feel; monophonic ones must not. */
  readonly humanize: boolean;
  readonly offset?: number;
}

export interface StepResult {
  readonly events: NoteEvent[];
  /** Set when this step began a bar that started a new arrangement phase. */
  readonly newPhase: ArrangementPhase | null;
}

/** Humanise-jitter ceiling in seconds. */
export const HUMAN_JITTER = 0.005;

/** Raises/lowers a random chord tone by an octave and thins or thickens the voicing per phase. */
export function dynamicVoicing(rawNotes: readonly NoteName[], phase: ArrangementPhase, rng: Rng): NoteName[] {
  const voiced = [...rawNotes];
  if (rng() < 0.45 && voiced.length > 3) {
    const idx = 1 + randomInt(rng, voiced.length - 1);
    const note = voiced[idx];
    if (note) voiced[idx] = transpose(note, rng() < 0.5 ? 12 : -12);
  }
  if (phase === 'BREAKDOWN' || phase === 'INTRO') return voiced.filter((_, i) => i !== 1); // airy
  if (phase === 'PEAK' || phase === 'SOLO') {
    const top = voiced[voiced.length - 1];
    if (top) voiced.push(transpose(top, 12)); // shimmering top octave
  }
  return voiced;
}

function chordFor(state: ComposerState, station: Station): Chord {
  const progression = station.progressions[state.progressionIdx % station.progressions.length];
  const chord = progression?.[state.chordIdx];
  if (!chord) throw new Error(`No chord at progression ${state.progressionIdx}, index ${state.chordIdx}`);
  return chord;
}

/**
 * Generates everything that happens on one 16th-note step. Pure apart from `state`, which it
 * advances: all randomness comes from `rng`, so a seeded rng gives a reproducible performance.
 */
export function composeStep(state: ComposerState, station: Station, rng: Rng): StepResult {
  const events: NoteEvent[] = [];
  const style = station.style;
  const stepInBar = state.step % 16;

  let newPhase: ArrangementPhase | null = null;
  if (stepInBar === 0 && state.step > 0) newPhase = advanceBar(state, station, rng);

  const phase = currentPhase(state);
  const chord = chordFor(state, station);
  const isFillBar = state.barsInPhase === state.phaseTargetBars - 1;
  const velBase = 0.65 + state.speedMod * 0.25;
  const emit = (e: NoteEvent): void => {
    events.push(e);
  };

  // 1. Pad: a chord swell each bar; lo-fi adds a syncopated stab.
  if (stepInBar === 0) {
    emit({
      instrument: 'pad',
      notes: dynamicVoicing(chord.notes, phase, rng),
      duration: style === 'ambient' ? '1m' : '2n.',
      velocity: (phase === 'BREAKDOWN' ? 0.5 : 0.78) * (0.9 + rng() * 0.2),
      humanize: true,
    });
  } else if (stepInBar === 10 && style === 'lofi' && rng() < 0.55) {
    emit({
      instrument: 'pad',
      notes: chord.notes.slice(1, 5),
      duration: '8n',
      velocity: 0.45,
      humanize: true,
    });
  }

  // 2. Bass: root / fifth / octave patterns per style.
  if (phase !== 'INTRO') {
    if (style === 'synthwave' || style === 'cyber') {
      const active =
        phase === 'BREAKDOWN'
          ? stepInBar === 0 || stepInBar === 8
          : stepInBar % 2 === 0 || (phase === 'PEAK' && stepInBar % 4 === 3);
      if (active) {
        let note = chord.root;
        const r = rng();
        if (stepInBar === 14 && r < 0.65) note = chord.fifth;
        else if (stepInBar % 4 === 2 && r < 0.55) note = chord.octave;
        else if (r < 0.18) note = chord.fifth;
        emit({
          instrument: 'bass',
          notes: note,
          duration: '16n',
          velocity: (stepInBar % 4 === 0 ? 0.9 : 0.68) * (0.85 + rng() * 0.2),
          humanize: false,
        });
      }
    } else if (style === 'lofi' || style === 'americana') {
      const isBeat =
        stepInBar === 0 || stepInBar === 6 || stepInBar === 10 || (stepInBar === 14 && rng() < 0.5);
      if (isBeat && !(phase === 'BREAKDOWN' && stepInBar > 0)) {
        let note = chord.root;
        if (stepInBar === 6 && rng() < 0.5) note = chord.fifth;
        if (stepInBar === 10) note = rng() < 0.6 ? chord.fifth : chord.octave;
        if (stepInBar === 14) note = station.scale[randomInt(rng, 5)] ?? chord.root;
        emit({ instrument: 'bass', notes: note, duration: '8n', velocity: 0.78, humanize: false });
      }
    } else if (stepInBar === 0 && (state.barCount % 2 === 0 || rng() < 0.4)) {
      emit({
        instrument: 'bass',
        notes: rng() < 0.75 ? chord.root : chord.fifth,
        duration: '1m',
        velocity: 0.65,
        humanize: false,
      });
    }
  }

  // 3. Arpeggiator: random walk through the chord, sometimes an octave up or a scale tone.
  const arpChance = phase === 'PEAK' ? 0.88 : phase === 'CRUISE' ? 0.72 : phase === 'SOLO' ? 0.55 : 0.35;
  const isArpStep =
    style === 'synthwave' || style === 'cyber'
      ? stepInBar % 2 === 0 || (phase === 'PEAK' && (stepInBar + state.euclidRotation) % 3 === 0)
      : style === 'americana'
        ? stepInBar % 2 === 0
        : (stepInBar + state.euclidRotation) % 4 === 2;
  if (isArpStep && rng() < arpChance) {
    if (rng() < 0.25) state.arpDirection = state.arpDirection === 1 ? -1 : 1;
    const len = chord.notes.length;
    state.arpWalkIdx = (state.arpWalkIdx + state.arpDirection + len) % len;
    let note = chord.notes[state.arpWalkIdx] ?? chord.root;
    if (rng() < 0.28) note = transpose(note, 12);
    else if (rng() < 0.2) note = station.scale[4 + randomInt(rng, station.scale.length - 5)] ?? note;
    emit({
      instrument: 'arp',
      notes: note,
      duration: style === 'ambient' ? '2n' : '16n',
      velocity: (0.5 + rng() * 0.38) * velBase,
      humanize: true,
    });
  }

  // 4. Lead: Markov-style melody over the scale, landing on chord tones on strong beats.
  const leadActive = phase === 'SOLO' || phase === 'PEAK' || (phase === 'CRUISE' && state.barCount % 2 === 1);
  if (leadActive) {
    const isPhraseRest = stepInBar >= 11 && stepInBar <= 13 && rng() < 0.6;
    const leadProb = phase === 'SOLO' ? 0.52 : phase === 'PEAK' ? 0.36 : 0.2;
    if (!isPhraseRest && (stepInBar % 2 === 0 || rng() < 0.28) && rng() < leadProb) {
      const intervals = [-2, -1, -1, 0, 1, 1, 2, 3, -3];
      const delta = intervals[randomInt(rng, intervals.length)] ?? 0;
      state.melodyDegree = Math.max(3, Math.min(station.scale.length - 1, state.melodyDegree + delta));
      let note = station.scale[state.melodyDegree] ?? chord.root;
      if ((stepInBar === 0 || stepInBar === 8) && rng() < 0.65) {
        const target = chord.notes[2 + randomInt(rng, chord.notes.length - 2)];
        if (target) note = transpose(target, 12);
      }
      const durations = ['8n', '8n.', '4n', '16n'];
      emit({
        instrument: 'lead',
        notes: note,
        duration: durations[randomInt(rng, durations.length)] ?? '8n',
        velocity: (0.58 + rng() * 0.32) * velBase,
        humanize: false,
      });
    }
  }

  // 5. Drums: kick, snare with ghost notes and bar-end fills, hats.
  if (style !== 'ambient' && phase !== 'INTRO' && phase !== 'BREAKDOWN') {
    const mainKick =
      style === 'cyber'
        ? stepInBar % 4 === 0
        : stepInBar === 0 || stepInBar === 8 || (stepInBar === 10 && style === 'lofi' && rng() < 0.6);
    const ghostKick = (stepInBar === 7 || stepInBar === 15) && rng() < 0.25;
    if (mainKick || ghostKick) {
      emit({
        instrument: 'kick',
        notes: 'C1',
        duration: '8n',
        velocity: mainKick ? 0.92 : 0.55,
        humanize: false,
      });
    }

    const mainSnare = stepInBar === 4 || stepInBar === 12;
    const fillSnare = isFillBar && stepInBar >= 11 && rng() < 0.68;
    const ghostSnare = (stepInBar === 7 || stepInBar === 9 || stepInBar === 15) && rng() < 0.18;
    if (mainSnare || fillSnare || ghostSnare) {
      const velocity = mainSnare ? 0.82 : fillSnare ? 0.65 + (stepInBar - 11) * 0.06 : 0.32;
      emit({ instrument: 'snare', duration: '16n', velocity, humanize: false });
    }

    const hatStep =
      phase === 'PEAK' || style === 'cyber' ? stepInBar % 2 === 0 || rng() < 0.35 : stepInBar % 2 === 0;
    if (hatStep) {
      const isOpen = (stepInBar === 2 || stepInBar === 10 || (isFillBar && stepInBar === 14)) && rng() < 0.45;
      emit({
        instrument: isOpen ? 'openHat' : 'closedHat',
        duration: '32n',
        velocity: (stepInBar % 4 === 2 ? 0.75 : 0.42) * (0.8 + rng() * 0.35),
        humanize: false,
        offset: 0.001,
      });
    }
  } else if (phase === 'BREAKDOWN' && style !== 'ambient') {
    if (stepInBar === 0 && rng() < 0.7) {
      emit({ instrument: 'kick', notes: 'C1', duration: '8n', velocity: 0.5, humanize: false });
    }
    if (stepInBar === 12 && rng() < 0.5) {
      emit({ instrument: 'openHat', duration: '32n', velocity: 0.35, humanize: false, offset: 0.001 });
    }
  }

  state.step++;
  return { events, newPhase };
}
