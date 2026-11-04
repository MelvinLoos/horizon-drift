import type { NoteName } from '../config/stations';

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 } as const;

/** MIDI number of a note name (C4 = 60). */
export function noteToMidi(note: NoteName): number {
  const letter = note.charAt(0) as keyof typeof SEMITONE; // NoteName guarantees A–G
  const sharp = note.charAt(1) === '#';
  const octave = Number(note.slice(sharp ? 2 : 1));
  return (octave + 1) * 12 + SEMITONE[letter] + (sharp ? 1 : 0);
}

/** Note name for a MIDI number, using sharps (same spelling as Tone.js's `toNote`). */
export function midiToNote(midi: number): NoteName {
  /* v8 ignore next -- the index is always 0–11; the fallback only satisfies noUncheckedIndexedAccess */
  const name = NAMES[((midi % 12) + 12) % 12] ?? 'C';
  return `${name}${Math.floor(midi / 12) - 1}` as NoteName;
}

export function transpose(note: NoteName, semitones: number): NoteName {
  return midiToNote(noteToMidi(note) + semitones);
}
