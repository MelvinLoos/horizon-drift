import { createStore, type Store } from '../core/store';
import type { Rng } from '../core/rng';
import type { Station } from '../config/stations';
import { RadioEngine } from './RadioEngine';

/** What the radio console displays. */
export interface RadioState {
  stationIndex: number;
  /** The engine has been started (the user clicked Start). */
  started: boolean;
  muted: boolean;
  /** Current arrangement phase, e.g. CRUISE. */
  phase: string;
}

export interface RadioOptions {
  stations: readonly [Station, ...Station[]];
  rng: Rng;
  /** Short messages for the HUD toast. */
  notify(message: string): void;
  onError(error: unknown): void;
}

/**
 * The radio as the rest of the app sees it: tuning, muting and volume that work at any time, also
 * before the engine starts (the prototype threw on station changes before the first click: BUG-001).
 */
export class Radio {
  readonly store: Store<RadioState>;
  private readonly engine: RadioEngine;

  constructor(private readonly options: RadioOptions) {
    this.store = createStore<RadioState>({ stationIndex: 0, started: false, muted: false, phase: 'CRUISE' });
    this.engine = new RadioEngine(options.stations[0], options.rng, {
      onPhase: (phase) => {
        this.store.set({ phase });
      },
      onError: (error) => {
        options.onError(error);
      },
    });
  }

  get station(): Station {
    return this.options.stations[this.store.get().stationIndex] ?? this.options.stations[0];
  }

  get stationIndex(): number {
    return this.store.get().stationIndex;
  }

  /** Starts audio. Must run inside a user gesture. */
  async init(): Promise<void> {
    await this.engine.start();
    this.store.set({ started: true });
  }

  changeStation(direction: 1 | -1): void {
    const count = this.options.stations.length;
    const stationIndex = (this.stationIndex + direction + count) % count;
    this.store.set({ stationIndex });
    this.engine.setStation(this.station, this.store.get().started);
    this.options.notify(`RADIO TUNED • ${this.station.freq} — ${this.station.name.toUpperCase()}`);
  }

  toggleMute(): void {
    const muted = !this.store.get().muted;
    this.store.set({ muted });
    this.engine.setMuted(muted);
    this.options.notify(muted ? 'RADIO MUTED' : 'RADIO ON');
  }

  /** Volume in dB (the slider range is −28..0). */
  setVolume(db: number): void {
    this.engine.setVolume(db);
  }

  updateDrivingDynamics(speedKmh: number): void {
    this.engine.setDrivingSpeed(speedKmh);
  }

  dispose(): void {
    this.engine.dispose();
    this.store.set({ started: false, phase: 'CRUISE' });
  }
}
