import { randomInt, type Rng } from '../../core/rng';
import { ARRANGEMENT_PHASES, type ArrangementPhase, type Station } from '../../config/stations';

/** Everything the generative composer remembers between steps. */
export interface ComposerState {
  /** 16th-note steps played so far. */
  step: number;
  barCount: number;
  progressionIdx: number;
  /** Chord within the current 4-bar progression. */
  chordIdx: number;
  /** Index into ARRANGEMENT_PHASES. */
  phaseIdx: number;
  barsInPhase: number;
  phaseTargetBars: number;
  arpDirection: 1 | -1;
  arpWalkIdx: number;
  /** Position in the station scale of the improvised lead melody. */
  melodyDegree: number;
  euclidRotation: number;
  /** Driving intensity 0..1; louder, brighter velocities when faster. */
  speedMod: number;
}

export function createComposerState(): ComposerState {
  return {
    step: 0,
    barCount: 0,
    progressionIdx: 0,
    chordIdx: 0,
    phaseIdx: 1, // starts in CRUISE
    barsInPhase: 0,
    phaseTargetBars: 8,
    arpDirection: 1,
    arpWalkIdx: 0,
    melodyDegree: 7,
    euclidRotation: 0,
    speedMod: 0.5,
  };
}

export function currentPhase(state: ComposerState): ArrangementPhase {
  return ARRANGEMENT_PHASES[state.phaseIdx % ARRANGEMENT_PHASES.length] ?? 'CRUISE';
}

/** Called when the listener tunes to a station: pick a random progression and restart the phrase. */
export function resetForStation(state: ComposerState, station: Station, rng: Rng): void {
  state.progressionIdx = randomInt(rng, station.progressions.length);
  state.chordIdx = 0;
}

/**
 * Moves to the next bar: may start a new arrangement phase (returned) and advances the chord,
 * branching to another progression at the end of each four-bar phrase.
 */
export function advanceBar(state: ComposerState, station: Station, rng: Rng): ArrangementPhase | null {
  state.barCount++;
  state.barsInPhase++;

  let newPhase: ArrangementPhase | null = null;
  if (state.barsInPhase >= state.phaseTargetBars) {
    state.barsInPhase = 0;
    // Mostly the next phase, sometimes skip ahead, so the structure never repeats exactly.
    const offset = rng() < 0.65 ? 1 : 2 + randomInt(rng, 2);
    state.phaseIdx = (state.phaseIdx + offset) % ARRANGEMENT_PHASES.length;
    newPhase = currentPhase(state);
    state.phaseTargetBars =
      newPhase === 'BREAKDOWN' || newPhase === 'INTRO' ? 4 + randomInt(rng, 3) : 6 + randomInt(rng, 5);
    state.arpDirection = rng() < 0.5 ? 1 : -1;
    state.euclidRotation = randomInt(rng, 8);
  }

  const count: number = station.progressions.length; // widened: stations may grow beyond three
  state.chordIdx++;
  if (state.chordIdx >= 4) {
    state.chordIdx = 0;
    // 70 %: switch to a different progression (any of the others, not just the first three: BUG-008).
    if (count > 1 && rng() < 0.7) {
      const offset = 1 + randomInt(rng, count - 1);
      state.progressionIdx = (state.progressionIdx + offset) % count;
    }
  } else if (rng() < 0.14) {
    // Occasional mid-phrase substitution for surprise.
    state.progressionIdx = (state.progressionIdx + 1) % count;
  }
  return newPhase;
}
