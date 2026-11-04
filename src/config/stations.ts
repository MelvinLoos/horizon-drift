/** Radio stations of the generative synth radio. Pure data; the composer interprets it. */

type Letter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
type Octave = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
/** Scientific pitch notation, e.g. `C4` or `F#3`. Checked at compile time. */
export type NoteName = `${Letter}${'' | '#'}${Octave}`;

export interface Chord {
  readonly root: NoteName;
  readonly fifth: NoteName;
  readonly octave: NoteName;
  /** Voicing, lowest note first. */
  readonly notes: readonly NoteName[];
}

/** Four chords, one per bar of a four-bar phrase. */
export type Progression = readonly [Chord, Chord, Chord, Chord];

export const STATION_STYLES = ['synthwave', 'lofi', 'ambient', 'americana', 'cyber'] as const;
export type StationStyle = (typeof STATION_STYLES)[number];

export interface Station {
  readonly freq: string;
  readonly name: string;
  readonly genre: string;
  readonly bpm: number;
  /** CSS accent colour. */
  readonly color: string;
  readonly style: StationStyle;
  /** Melody scale, ascending. */
  readonly scale: readonly NoteName[];
  /** One or more four-chord progressions; the composer branches between whatever is listed. */
  readonly progressions: readonly [Progression, ...Progression[]];
}

export const RADIO_STATIONS = [
  {
    freq: '88.5 FM',
    name: 'Nightcall Synthwave',
    genre: 'Generative Analog Arps & FM Solo',
    bpm: 106,
    color: '#f43f5e',
    style: 'synthwave',
    scale: ['A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5', 'A5'],
    progressions: [
      [
        { root: 'A1', fifth: 'E2', octave: 'A2', notes: ['A2', 'E3', 'A3', 'C4', 'E4'] },
        { root: 'F1', fifth: 'C2', octave: 'F2', notes: ['F2', 'C3', 'A3', 'C4', 'E4'] },
        { root: 'C2', fifth: 'G2', octave: 'C3', notes: ['C3', 'G3', 'B3', 'E4', 'G4'] },
        { root: 'G1', fifth: 'D2', octave: 'G2', notes: ['G2', 'D3', 'B3', 'D4', 'G4'] },
      ],
      [
        { root: 'D2', fifth: 'A2', octave: 'D3', notes: ['D3', 'A3', 'C4', 'F4', 'A4'] },
        { root: 'A1', fifth: 'E2', octave: 'A2', notes: ['A2', 'E3', 'C4', 'E4', 'A4'] },
        { root: 'F1', fifth: 'C2', octave: 'F2', notes: ['F2', 'C3', 'A3', 'E4', 'G4'] },
        { root: 'E1', fifth: 'B1', octave: 'E2', notes: ['E2', 'B2', 'G3', 'B3', 'E4'] },
      ],
      [
        { root: 'F1', fifth: 'C2', octave: 'F2', notes: ['F2', 'C3', 'A3', 'C4', 'F4'] },
        { root: 'G1', fifth: 'D2', octave: 'G2', notes: ['G2', 'D3', 'B3', 'D4', 'G4'] },
        { root: 'E1', fifth: 'B1', octave: 'E2', notes: ['E2', 'B2', 'G3', 'D4', 'F#4'] },
        { root: 'A1', fifth: 'E2', octave: 'A2', notes: ['A2', 'E3', 'B3', 'C4', 'E4'] },
      ],
    ],
  },
  {
    freq: '94.2 FM',
    name: 'Canyon Lo-Fi Chill',
    genre: 'Evolving Neo-Soul Rhodes & Vinyl Jazz',
    bpm: 80,
    color: '#f59e0b',
    style: 'lofi',
    scale: ['D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'C5', 'D5', 'E5'],
    progressions: [
      [
        { root: 'D2', fifth: 'A2', octave: 'D3', notes: ['D3', 'F3', 'A3', 'C4', 'E4'] },
        { root: 'G1', fifth: 'D2', octave: 'G2', notes: ['G2', 'F3', 'A3', 'B3', 'E4'] },
        { root: 'C2', fifth: 'G2', octave: 'C3', notes: ['C3', 'E3', 'G3', 'B3', 'D4'] },
        { root: 'A1', fifth: 'E2', octave: 'A2', notes: ['A2', 'G3', 'B3', 'C#4', 'F4'] },
      ],
      [
        { root: 'F1', fifth: 'C2', octave: 'F2', notes: ['F2', 'E3', 'A3', 'C4', 'D4'] },
        { root: 'E1', fifth: 'B1', octave: 'E2', notes: ['E2', 'D3', 'G#3', 'B3', 'D4'] },
        { root: 'A1', fifth: 'E2', octave: 'A2', notes: ['A2', 'C3', 'G3', 'B3', 'E4'] },
        { root: 'D2', fifth: 'A2', octave: 'D3', notes: ['D3', 'F3', 'A3', 'C4', 'F4'] },
      ],
      [
        { root: 'B1', fifth: 'F2', octave: 'B2', notes: ['B2', 'D3', 'F3', 'A3', 'D4'] },
        { root: 'E1', fifth: 'B1', octave: 'E2', notes: ['E2', 'D3', 'G3', 'B3', 'C#4'] },
        { root: 'A1', fifth: 'E2', octave: 'A2', notes: ['A2', 'E3', 'G3', 'C4', 'E4'] },
        { root: 'G1', fifth: 'D2', octave: 'G2', notes: ['G2', 'D3', 'F3', 'B3', 'D4'] },
      ],
    ],
  },
  {
    freq: '101.7 FM',
    name: 'Cosmic Horizon Ambient',
    genre: 'Drifting Lydian Shimmer & Starlight',
    bpm: 66,
    color: '#38bdf8',
    style: 'ambient',
    scale: [
      'E3',
      'F#3',
      'G#3',
      'B3',
      'C#4',
      'D#4',
      'E4',
      'F#4',
      'G#4',
      'B4',
      'C#5',
      'D#5',
      'E5',
      'G#5',
      'B5',
    ],
    progressions: [
      [
        { root: 'E1', fifth: 'B1', octave: 'E2', notes: ['E2', 'B2', 'F#3', 'G#3', 'D#4'] },
        { root: 'C#2', fifth: 'G#2', octave: 'C#3', notes: ['C#3', 'G#3', 'B3', 'E4', 'F#4'] },
        { root: 'A1', fifth: 'E2', octave: 'A2', notes: ['A2', 'E3', 'B3', 'C#4', 'G#4'] },
        { root: 'B1', fifth: 'F#2', octave: 'B2', notes: ['B2', 'F#3', 'B3', 'D#4', 'F#4'] },
      ],
      [
        { root: 'A1', fifth: 'E2', octave: 'A2', notes: ['A2', 'E3', 'G#3', 'B3', 'D#4'] },
        { root: 'E1', fifth: 'B1', octave: 'E2', notes: ['E2', 'B2', 'G#3', 'B3', 'F#4'] },
        { root: 'F#1', fifth: 'C#2', octave: 'F#2', notes: ['F#2', 'C#3', 'A3', 'C#4', 'E4'] },
        { root: 'B1', fifth: 'F#2', octave: 'B2', notes: ['B2', 'F#3', 'A3', 'C#4', 'F#4'] },
      ],
      [
        { root: 'C#2', fifth: 'G#2', octave: 'C#3', notes: ['C#3', 'G#3', 'E4', 'F#4', 'B4'] },
        { root: 'G#1', fifth: 'D#2', octave: 'G#2', notes: ['G#2', 'D#3', 'B3', 'D#4', 'F#4'] },
        { root: 'A1', fifth: 'E2', octave: 'A2', notes: ['A2', 'E3', 'C#4', 'E4', 'G#4'] },
        { root: 'E1', fifth: 'B1', octave: 'E2', notes: ['E2', 'B2', 'F#3', 'B3', 'E4'] },
      ],
    ],
  },
  {
    freq: '105.3 FM',
    name: 'Desert Americana',
    genre: 'Fingerpicked Open-Tuning & Slide Lead',
    bpm: 94,
    color: '#34d399',
    style: 'americana',
    scale: ['G3', 'A3', 'B3', 'D4', 'E4', 'F#4', 'G4', 'A4', 'B4', 'D5', 'E5', 'F#5', 'G5', 'A5', 'B5'],
    progressions: [
      [
        { root: 'G1', fifth: 'D2', octave: 'G2', notes: ['G2', 'D3', 'G3', 'B3', 'D4'] },
        { root: 'D2', fifth: 'A2', octave: 'D3', notes: ['D3', 'A3', 'D4', 'F#4', 'A4'] },
        { root: 'E1', fifth: 'B1', octave: 'E2', notes: ['E2', 'B2', 'G3', 'B3', 'E4'] },
        { root: 'C2', fifth: 'G2', octave: 'C3', notes: ['C3', 'G3', 'C4', 'E4', 'G4'] },
      ],
      [
        { root: 'C2', fifth: 'G2', octave: 'C3', notes: ['C3', 'G3', 'D4', 'E4', 'G4'] },
        { root: 'G1', fifth: 'D2', octave: 'G2', notes: ['G2', 'D3', 'A3', 'B3', 'D4'] },
        { root: 'A1', fifth: 'E2', octave: 'A2', notes: ['A2', 'E3', 'A3', 'C4', 'E4'] },
        { root: 'D2', fifth: 'A2', octave: 'D3', notes: ['D3', 'A3', 'C4', 'F#4', 'A4'] },
      ],
      [
        { root: 'E1', fifth: 'B1', octave: 'E2', notes: ['E2', 'B2', 'G3', 'D4', 'E4'] },
        { root: 'C2', fifth: 'G2', octave: 'C3', notes: ['C3', 'G3', 'B3', 'D4', 'G4'] },
        { root: 'G1', fifth: 'D2', octave: 'G2', notes: ['G2', 'D3', 'G3', 'B3', 'D4'] },
        { root: 'D2', fifth: 'A2', octave: 'D3', notes: ['D3', 'A3', 'D4', 'F#4', 'G4'] },
      ],
    ],
  },
  {
    freq: '108.9 FM',
    name: 'Autobahn Cyber-Pulse',
    genre: 'Evolving Polyrhythms & Acid Sequence',
    bpm: 122,
    color: '#a855f7',
    style: 'cyber',
    scale: ['F#3', 'G#3', 'A3', 'B3', 'C#4', 'D4', 'E4', 'F#4', 'G#4', 'A4', 'B4', 'C#5', 'E5', 'F#5', 'A5'],
    progressions: [
      [
        { root: 'F#1', fifth: 'C#2', octave: 'F#2', notes: ['F#2', 'C#3', 'A3', 'C#4', 'E4'] },
        { root: 'D1', fifth: 'A1', octave: 'D2', notes: ['D2', 'A2', 'F#3', 'A3', 'C#4'] },
        { root: 'B1', fifth: 'F#2', octave: 'B2', notes: ['B2', 'F#3', 'A3', 'D4', 'F#4'] },
        { root: 'C#1', fifth: 'G#1', octave: 'C#2', notes: ['C#2', 'G#2', 'F3', 'B3', 'C#4'] },
      ],
      [
        { root: 'D1', fifth: 'A1', octave: 'D2', notes: ['D2', 'A2', 'F#3', 'B3', 'E4'] },
        { root: 'E1', fifth: 'B1', octave: 'E2', notes: ['E2', 'B2', 'G#3', 'B3', 'E4'] },
        { root: 'F#1', fifth: 'C#2', octave: 'F#2', notes: ['F#2', 'C#3', 'A3', 'C#4', 'F#4'] },
        { root: 'A1', fifth: 'E2', octave: 'A2', notes: ['A2', 'E3', 'A3', 'C#4', 'E4'] },
      ],
      [
        { root: 'B1', fifth: 'F#2', octave: 'B2', notes: ['B2', 'F#3', 'A3', 'C#4', 'F#4'] },
        { root: 'F#1', fifth: 'C#2', octave: 'F#2', notes: ['F#2', 'C#3', 'A3', 'C#4', 'E4'] },
        { root: 'G1', fifth: 'D2', octave: 'G2', notes: ['G2', 'D3', 'B3', 'D4', 'F#4'] },
        { root: 'C#1', fifth: 'G#1', octave: 'C#2', notes: ['C#2', 'G#2', 'F3', 'G#3', 'C#4'] },
      ],
    ],
  },
] as const satisfies readonly Station[];

export const ARRANGEMENT_PHASE_NAMES = ['INTRO', 'CRUISE', 'PEAK', 'SOLO', 'BREAKDOWN'] as const;
export type ArrangementPhase = (typeof ARRANGEMENT_PHASE_NAMES)[number];

/** The arrangement walks this cycle (with random skips) so song structure never repeats exactly. */
export const ARRANGEMENT_PHASES = [
  'INTRO',
  'CRUISE',
  'PEAK',
  'SOLO',
  'BREAKDOWN',
  'CRUISE',
  'SOLO',
  'PEAK',
] as const satisfies readonly ArrangementPhase[];
