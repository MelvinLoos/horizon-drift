import * as Tone from 'tone';
import type { Rng } from '../core/rng';
import { clamp } from '../core/math';
import type { Station, StationStyle } from '../config/stations';
import {
  createComposerState,
  currentPhase,
  resetForStation,
  type ComposerState,
} from './composer/arrangement';
import { composeStep, HUMAN_JITTER, type NoteEvent } from './composer/patterns';

export interface EngineHooks {
  /** A new arrangement phase began (INTRO, CRUISE, …). */
  onPhase(phase: string): void;
  /** A step failed to compose or play. The engine logs nothing itself and keeps playing. */
  onError(error: unknown): void;
}

/** Reverb/delay/FM settings per style. */
const STYLE_FX: Readonly<Record<StationStyle, { reverb: number; delay: number; fmIndex: number }>> = {
  ambient: { reverb: 0.68, delay: 0.45, fmIndex: 1.4 },
  lofi: { reverb: 0.34, delay: 0.24, fmIndex: 1.8 },
  cyber: { reverb: 0.38, delay: 0.36, fmIndex: 4.2 },
  synthwave: { reverb: 0.44, delay: 0.34, fmIndex: 2.6 },
  americana: { reverb: 0.44, delay: 0.34, fmIndex: 2.6 },
};

const SWING: Readonly<Record<StationStyle, number>> = {
  lofi: 0.22,
  americana: 0.08,
  synthwave: 0.02,
  ambient: 0.02,
  cyber: 0.02,
};

const MUTE_DB = -70;
const MUTE_RAMP_S = 0.12;

/** Arp filter base cutoff per style; opens up with driving speed. */
function arpBaseCutoff(style: StationStyle): number {
  return style === 'lofi' ? 1100 : style === 'ambient' ? 1800 : 1650;
}

/**
 * The Tone.js side of the radio: builds the synth graph and plays the events the pure composer
 * produces. It never touches the DOM. Call `start()` from a user gesture (browser autoplay rules).
 */
export class RadioEngine {
  readonly composer: ComposerState = createComposerState();
  private started = false;
  private muted = false;
  private volumeDb = -6;
  private station: Station;

  private graph: {
    masterVol: Tone.Volume;
    reverb: Tone.Reverb;
    delay: Tone.PingPongDelay;
    arpFilter: Tone.Filter;
    pad: Tone.PolySynth;
    bass: Tone.MonoSynth;
    arp: Tone.PolySynth;
    lead: Tone.MonoSynth;
    kick: Tone.MembraneSynth;
    snare: Tone.NoiseSynth;
    openHat: Tone.NoiseSynth;
    closedHat: Tone.NoiseSynth;
    staticNoise: Tone.NoiseSynth;
    loop: Tone.Loop;
    nodes: Tone.ToneAudioNode[];
  } | null = null;

  constructor(
    station: Station,
    private readonly rng: Rng,
    private readonly hooks: EngineHooks,
  ) {
    this.station = station;
    // No random draws here: construction must not consume the app's random stream (page load).
  }

  get isStarted(): boolean {
    return this.started;
  }

  async start(): Promise<void> {
    if (this.started) return;
    await Tone.start();
    resetForStation(this.composer, this.station, this.rng);
    this.graph = this.buildGraph();
    this.started = true;
    this.applyStation();
    this.applyVolume();
    Tone.getTransport().start();
  }

  /** Switches the station; safe before `start()` (only the composer state changes then). */
  setStation(station: Station, withStaticBurst: boolean): void {
    this.station = station;
    resetForStation(this.composer, station, this.rng);
    if (!this.graph) return;
    if (withStaticBurst && !this.muted) this.graph.staticNoise.triggerAttackRelease('16n');
    this.applyStation();
  }

  setVolume(db: number): void {
    this.volumeDb = db;
    this.applyVolume();
  }

  /** A real mute: the master volume ramps away and back; the music keeps playing underneath. */
  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyVolume();
  }

  /** Driving intensity: faster means brighter arps and louder velocities. */
  setDrivingSpeed(speedKmh: number): void {
    this.composer.speedMod = clamp(speedKmh / 200, 0, 1);
    if (!this.graph) return;
    const cutoff = arpBaseCutoff(this.station.style) + this.composer.speedMod * 2400;
    this.graph.arpFilter.frequency.rampTo(cutoff, 0.25);
  }

  dispose(): void {
    if (!this.graph) return;
    this.graph.loop.stop().dispose();
    Tone.getTransport().stop();
    for (const node of this.graph.nodes) node.dispose();
    this.graph = null;
    this.started = false;
  }

  private applyVolume(): void {
    this.graph?.masterVol.volume.rampTo(this.muted ? MUTE_DB : this.volumeDb, MUTE_RAMP_S);
  }

  private applyStation(): void {
    const graph = this.graph;
    if (!graph) return;
    const st = this.station;
    const transport = Tone.getTransport();
    transport.bpm.rampTo(st.bpm, 0.6);
    transport.swing = SWING[st.style];
    transport.swingSubdivision = '16n';
    const fx = STYLE_FX[st.style];
    graph.reverb.wet.value = fx.reverb;
    graph.delay.wet.value = fx.delay;
    graph.lead.set({ oscillator: { modulationIndex: fx.fmIndex } });
    this.hooks.onPhase(currentPhase(this.composer));
  }

  private tick(time: number): void {
    if (!this.started) return;
    try {
      const { events, newPhase } = composeStep(this.composer, this.station, this.rng);
      for (const event of events) this.play(event, time);
      if (newPhase) this.hooks.onPhase(newPhase);
    } catch (error) {
      // Keep the clock moving; a failing step must not stall the song. The error is reported,
      // not swallowed (BUG-006).
      this.composer.step++;
      this.hooks.onError(error);
    }
  }

  private play(event: NoteEvent, time: number): void {
    const graph = this.graph;
    if (!graph) return;
    const t = (event.humanize ? time + this.rng() * HUMAN_JITTER : time) + (event.offset ?? 0);
    const notes = event.notes === undefined ? undefined : [event.notes].flat();
    const first = notes?.[0];
    const v = event.velocity;
    switch (event.instrument) {
      case 'pad':
        if (notes) graph.pad.triggerAttackRelease(notes, event.duration, t, v);
        break;
      case 'arp':
        if (notes) graph.arp.triggerAttackRelease(notes, event.duration, t, v);
        break;
      case 'bass':
        if (first) graph.bass.triggerAttackRelease(first, event.duration, t, v);
        break;
      case 'lead':
        if (first) graph.lead.triggerAttackRelease(first, event.duration, t, v);
        break;
      case 'kick':
        if (first) graph.kick.triggerAttackRelease(first, event.duration, t, v);
        break;
      case 'snare':
        graph.snare.triggerAttackRelease(event.duration, t, v);
        break;
      case 'openHat':
        graph.openHat.triggerAttackRelease(event.duration, t, v);
        break;
      case 'closedHat':
        graph.closedHat.triggerAttackRelease(event.duration, t, v);
        break;
    }
  }

  private buildGraph(): NonNullable<RadioEngine['graph']> {
    const nodes: Tone.ToneAudioNode[] = [];
    const track = <T extends Tone.ToneAudioNode>(node: T): T => {
      nodes.push(node);
      return node;
    };

    // Master bus: glue compression, then volume, then the speakers.
    const compressor = track(
      new Tone.Compressor({ threshold: -18, ratio: 3.5, attack: 0.02, release: 0.25 }),
    );
    const masterVol = track(new Tone.Volume(this.volumeDb).toDestination());
    compressor.connect(masterVol);

    const reverb = track(new Tone.Reverb({ decay: 4.8, wet: 0.42 }).connect(compressor));
    const delay = track(
      new Tone.PingPongDelay({ delayTime: '8n.', feedback: 0.34, wet: 0.32 }).connect(reverb),
    );
    const chorus = track(new Tone.Chorus(2.2, 3.5, 0.4).connect(reverb).start());

    // A slow LFO breathes on the pad filter so the timbre is never static.
    const padFilter = track(new Tone.Filter(1400, 'lowpass').connect(chorus));
    const filterLfo = track(new Tone.LFO('0.07hz', 650, 2400).start());
    filterLfo.connect(padFilter.frequency);

    const pad = track(
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'fatsawtooth', count: 3, spread: 26 },
        envelope: { attack: 1.1, decay: 1.8, sustain: 0.72, release: 3.2 },
      }).connect(padFilter),
    );
    pad.volume.value = -13;

    const bass = track(
      new Tone.MonoSynth({
        oscillator: { type: 'fatsawtooth', count: 2, spread: 12 },
        filter: { Q: 2.8, type: 'lowpass', rolloff: -24 },
        envelope: { attack: 0.008, decay: 0.24, sustain: 0.25, release: 0.35 },
        filterEnvelope: { attack: 0.01, decay: 0.18, sustain: 0.15, baseFrequency: 65, octaves: 2.6 },
      }).connect(compressor),
    );
    bass.volume.value = -7;

    const arpFilter = track(new Tone.Filter(2600, 'lowpass').connect(delay));
    const arp = track(
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.006, decay: 0.32, sustain: 0.06, release: 0.55 },
      }).connect(arpFilter),
    );
    arp.volume.value = -10;

    const lead = track(
      new Tone.MonoSynth({
        portamento: 0.06,
        oscillator: { type: 'fmsawtooth', modulationType: 'sine', modulationIndex: 2.5, harmonicity: 1 },
        filter: { Q: 1.8, type: 'lowpass', rolloff: -12 },
        envelope: { attack: 0.03, decay: 0.45, sustain: 0.4, release: 0.9 },
        filterEnvelope: { attack: 0.04, decay: 0.35, sustain: 0.3, baseFrequency: 320, octaves: 3.2 },
      }).connect(delay),
    );
    lead.volume.value = -10;

    const kick = track(
      new Tone.MembraneSynth({
        pitchDecay: 0.045,
        octaves: 5.5,
        envelope: { attack: 0.001, decay: 0.32, sustain: 0, release: 0.3 },
      }).connect(compressor),
    );
    kick.volume.value = -8;

    const snareFilter = track(new Tone.Filter(1800, 'bandpass').connect(reverb));
    const snare = track(
      new Tone.NoiseSynth({
        noise: { type: 'pink' },
        envelope: { attack: 0.001, decay: 0.16, sustain: 0, release: 0.08 },
      }).connect(snareFilter),
    );
    snare.volume.value = -14;

    // Two hi-hat voices with fixed envelopes. The prototype re-tuned a single envelope's decay
    // at schedule time, which also changed notes that were already scheduled (BUG-009).
    const hatFilter = track(new Tone.Filter(7500, 'highpass').connect(compressor));
    const hatEnvelope = (decay: number) => ({ attack: 0.001, decay, sustain: 0 });
    const closedHat = track(
      new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: hatEnvelope(0.035) }).connect(hatFilter),
    );
    const openHat = track(
      new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: hatEnvelope(0.14) }).connect(hatFilter),
    );
    closedHat.volume.value = -19;
    openHat.volume.value = -19;

    // Radio static between stations.
    const staticNoise = track(
      new Tone.NoiseSynth({
        noise: { type: 'pink' },
        envelope: { attack: 0.01, decay: 0.18, sustain: 0, release: 0.08 },
      }).connect(masterVol),
    );
    staticNoise.volume.value = -16;

    const loop = new Tone.Loop((time) => {
      this.tick(time);
    }, '16n').start(0);

    return {
      masterVol,
      reverb,
      delay,
      arpFilter,
      pad,
      bass,
      arp,
      lead,
      kick,
      snare,
      openHat,
      closedHat,
      staticNoise,
      loop,
      nodes,
    };
  }
}
