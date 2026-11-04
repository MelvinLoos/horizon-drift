// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** A stand-in for Tone.js: records construction and calls; the Loop callback is driven by tests. */
const tone = vi.hoisted(() => {
  const shared = {
    loopCallback: undefined as ((time: number) => void) | undefined,
    created: [] as { kind: string; options: unknown; node: Record<string, unknown> }[],
    started: false,
    transportStarted: false,
    transportStopped: false,
  };
  return shared;
});

vi.mock('tone', () => {
  const make = (kind: string) =>
    class {
      volume = { value: 0, rampTo: vi.fn() };
      frequency = { rampTo: vi.fn() };
      wet = { value: 0 };
      triggerAttackRelease = vi.fn();
      set = vi.fn();
      connect = (): this => this;
      toDestination = (): this => this;
      start = (): this => this;
      stop = (): this => this;
      dispose = vi.fn();
      constructor(...args: unknown[]) {
        tone.created.push({ kind, options: args[0], node: this as unknown as Record<string, unknown> });
        if (kind === 'Loop') tone.loopCallback = args[0] as (time: number) => void;
      }
    };
  const transport = {
    bpm: { rampTo: vi.fn() },
    swing: 0,
    swingSubdivision: '',
    start: () => {
      tone.transportStarted = true;
    },
    stop: () => {
      tone.transportStopped = true;
    },
  };
  return {
    start: () => {
      tone.started = true;
      return Promise.resolve();
    },
    getTransport: () => transport,
    Compressor: make('Compressor'),
    Volume: make('Volume'),
    Reverb: make('Reverb'),
    PingPongDelay: make('PingPongDelay'),
    Chorus: make('Chorus'),
    Filter: make('Filter'),
    LFO: make('LFO'),
    PolySynth: make('PolySynth'),
    MonoSynth: make('MonoSynth'),
    MembraneSynth: make('MembraneSynth'),
    NoiseSynth: make('NoiseSynth'),
    Synth: make('Synth'),
    Loop: make('Loop'),
  };
});

const { Radio } = await import('../../../src/audio/Radio');
const { bindRadioConsole } = await import('../../../src/ui/radioConsole');
const { RADIO_STATIONS } = await import('../../../src/config/stations');
const { createRng } = await import('../../../src/core/rng');

function makeRadio() {
  const notify = vi.fn();
  const onError = vi.fn();
  const radio = new Radio({ stations: RADIO_STATIONS, rng: createRng(5), notify, onError });
  return { radio, notify, onError };
}
const nodesOf = (kind: string) => tone.created.filter((c) => c.kind === kind);
const masterVolume = () => nodesOf('Volume')[0]?.node as { volume: { rampTo: ReturnType<typeof vi.fn> } };
const ticks = (n: number) => {
  for (let i = 0; i < n; i++) tone.loopCallback?.(i * 0.1);
};
const played = () =>
  tone.created.reduce(
    (sum, c) => sum + (c.node.triggerAttackRelease as ReturnType<typeof vi.fn>).mock.calls.length,
    0,
  );

beforeEach(() => {
  tone.created.length = 0;
  tone.loopCallback = undefined;
  tone.started = false;
  tone.transportStarted = false;
  tone.transportStopped = false;
});

describe('Radio before the engine starts (BUG-001)', () => {
  it('tunes without touching audio or throwing', () => {
    const { radio, notify } = makeRadio();
    expect(() => {
      radio.changeStation(1);
    }).not.toThrow();
    expect(radio.stationIndex).toBe(1);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining(RADIO_STATIONS[1].freq));
    expect(tone.started).toBe(false);
    expect(tone.created).toHaveLength(0);
  });

  it('wraps around in both directions', () => {
    const { radio } = makeRadio();
    radio.changeStation(-1);
    expect(radio.stationIndex).toBe(RADIO_STATIONS.length - 1);
    radio.changeStation(1);
    expect(radio.stationIndex).toBe(0);
  });

  it('remembers volume and mute chosen before start and applies them on start', async () => {
    const { radio } = makeRadio();
    radio.setVolume(-20);
    radio.toggleMute();
    await radio.init();
    expect(tone.started).toBe(true);
    expect(radio.store.get().started).toBe(true);
    expect(masterVolume().volume.rampTo).toHaveBeenLastCalledWith(-70, expect.any(Number));
    radio.toggleMute();
    expect(masterVolume().volume.rampTo).toHaveBeenLastCalledWith(-20, expect.any(Number));
  });
});

describe('RadioEngine behaviour', () => {
  it('plays music from the loop and keeps playing while muted (a real mute, BUG-010)', async () => {
    const { radio } = makeRadio();
    await radio.init();
    ticks(64);
    const before = played();
    expect(before).toBeGreaterThan(0);

    radio.toggleMute();
    expect(radio.store.get().muted).toBe(true);
    ticks(64);
    expect(played()).toBeGreaterThan(before);
    expect(masterVolume().volume.rampTo).toHaveBeenLastCalledWith(-70, expect.any(Number));
  });

  it('uses two hi-hat voices with fixed envelopes instead of re-tuning one (BUG-009)', async () => {
    const { radio } = makeRadio();
    await radio.init();
    const decays = nodesOf('NoiseSynth')
      .map((c) => c.options as { noise?: { type: string }; envelope: { decay: number } })
      .filter((o) => o.noise?.type === 'white')
      .map((o) => o.envelope.decay)
      .sort((a, b) => a - b);
    expect(decays).toEqual([0.035, 0.14]);
  });

  it('reports errors instead of swallowing them and keeps the clock moving (BUG-006)', async () => {
    const { radio, onError } = makeRadio();
    await radio.init();
    const engine = (radio as unknown as { engine: { composer: { chordIdx: number; step: number } } }).engine;
    engine.composer.chordIdx = 99; // no such chord: composing the step throws
    const stepBefore = engine.composer.step;
    expect(() => {
      ticks(1);
    }).not.toThrow();
    expect(onError).toHaveBeenCalledOnce();
    expect(engine.composer.step).toBe(stepBefore + 1);
  });

  it('does not start twice when Start is clicked twice (one graph, one loop)', async () => {
    const { radio } = makeRadio();
    await Promise.all([radio.init(), radio.init()]);
    expect(nodesOf('Loop')).toHaveLength(1);
    expect(nodesOf('Volume')).toHaveLength(1);
  });

  it('starts silent when muted before Start (no blip)', async () => {
    const { radio } = makeRadio();
    radio.toggleMute();
    await radio.init();
    expect(nodesOf('Volume')[0]?.options).toBe(-70);
  });

  it('does not draw random numbers when tuning before Start', () => {
    const rng = vi.fn(() => 0.5);
    const radio = new Radio({ stations: RADIO_STATIONS, rng, notify: vi.fn(), onError: vi.fn() });
    radio.changeStation(1);
    radio.changeStation(1);
    expect(rng).not.toHaveBeenCalled();
  });

  it('stops reporting after a few errors instead of flooding', async () => {
    const { radio, onError } = makeRadio();
    await radio.init();
    const engine = (radio as unknown as { engine: { composer: { chordIdx: number } } }).engine;
    for (let i = 0; i < 20; i++) {
      engine.composer.chordIdx = 99;
      ticks(1);
    }
    expect(onError).toHaveBeenCalledTimes(3);
  });

  it('survives a failing static burst while tuning quickly', async () => {
    const { radio, onError } = makeRadio();
    await radio.init();
    const staticNode = nodesOf('NoiseSynth').find(
      (c) => (c.options as { envelope: { decay: number } }).envelope.decay === 0.18,
    )?.node.triggerAttackRelease as ReturnType<typeof vi.fn>;
    staticNode.mockImplementation(() => {
      throw new Error('Start time must be strictly greater than previous start time');
    });
    expect(() => {
      radio.changeStation(1);
    }).not.toThrow();
    expect(onError).toHaveBeenCalledOnce();
    expect(radio.stationIndex).toBe(1);
  });

  it('plays a static burst when tuning while running, but not while muted', async () => {
    const { radio } = makeRadio();
    await radio.init();
    const staticNode = nodesOf('NoiseSynth').find(
      (c) =>
        (c.options as { noise: { type: string } }).noise.type === 'pink' &&
        (c.options as { envelope: { decay: number } }).envelope.decay === 0.18,
    )?.node.triggerAttackRelease as ReturnType<typeof vi.fn>;
    radio.changeStation(1);
    expect(staticNode).toHaveBeenCalledTimes(1);
    radio.toggleMute();
    radio.changeStation(1);
    expect(staticNode).toHaveBeenCalledTimes(1);
  });

  it('opens the arp filter with speed and clamps the intensity', async () => {
    const { radio } = makeRadio();
    await radio.init();
    radio.updateDrivingDynamics(400);
    const engine = (radio as unknown as { engine: { composer: { speedMod: number } } }).engine;
    expect(engine.composer.speedMod).toBe(1);
    const arpFilter = nodesOf('Filter').find((c) => c.options === 2600)?.node as {
      frequency: { rampTo: ReturnType<typeof vi.fn> };
    };
    expect(arpFilter.frequency.rampTo).toHaveBeenLastCalledWith(1650 + 2400, 0.25);
  });

  it('stops the transport and disposes every node', async () => {
    const { radio } = makeRadio();
    await radio.init();
    radio.dispose();
    expect(tone.transportStopped).toBe(true);
    expect(radio.store.get().started).toBe(false);
    for (const { kind, node } of tone.created) {
      if (kind !== 'Loop')
        expect((node.dispose as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
    }
  });
});

describe('radio console', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <span id="station-freq"></span><span id="station-name"></span>
      <span id="station-genre"></span><span id="station-phase"></span>
      <button id="radio-prev"></button><button id="radio-next"></button>
      <button id="radio-power"></button><input id="radio-volume" type="range" min="-28" max="0" value="-6" />
      <div class="eq-bar"></div><div class="eq-bar"></div>`;
  });
  const text = (id: string) => document.getElementById(id)?.textContent;

  it('shows the station and updates when tuning with the buttons', () => {
    const { radio } = makeRadio();
    bindRadioConsole(radio);
    expect(text('station-name')).toBe(RADIO_STATIONS[0].name);
    document.getElementById('radio-next')?.click();
    expect(text('station-freq')).toBe(RADIO_STATIONS[1].freq);
    expect(text('station-genre')).toBe(RADIO_STATIONS[1].genre);
    document.getElementById('radio-prev')?.click();
    expect(text('station-name')).toBe(RADIO_STATIONS[0].name);
  });

  it('reflects mute in data-state and aria-pressed', () => {
    const { radio } = makeRadio();
    bindRadioConsole(radio);
    const power = document.getElementById('radio-power');
    expect(power?.dataset.state).toBe('on');
    power?.click();
    expect(power?.dataset.state).toBe('muted');
    expect(power?.getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the arrangement phase and forwards the volume slider', async () => {
    const { radio } = makeRadio();
    bindRadioConsole(radio);
    await radio.init();
    ticks(16 * 40);
    expect(text('station-phase')).toBe(radio.store.get().phase);
    const slider = document.getElementById('radio-volume') as HTMLInputElement;
    slider.value = '-15';
    slider.dispatchEvent(new Event('input'));
    expect(masterVolume().volume.rampTo).toHaveBeenLastCalledWith(-15, expect.any(Number));
  });

  it('animates the equalizer only while playing, and stops listening after dispose', async () => {
    const { radio } = makeRadio();
    const view = bindRadioConsole(radio);
    const bar = document.querySelector<HTMLElement>('.eq-bar');
    view.updateVisualizer(1);
    expect(bar?.style.height).toBe('3px');
    await radio.init();
    view.updateVisualizer(1);
    expect(Number.parseInt(bar?.style.height ?? '0')).toBeGreaterThanOrEqual(4);
    radio.toggleMute();
    view.updateVisualizer(1);
    expect(bar?.style.height).toBe('3px');

    view.dispose();
    document.getElementById('radio-next')?.click();
    expect(radio.stationIndex).toBe(0);
  });
});
