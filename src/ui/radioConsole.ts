import type { Radio } from '../audio/Radio';
import { requireEl } from './dom';

export interface RadioConsole {
  /** Animates the equalizer; call once per frame with the elapsed time in seconds. */
  updateVisualizer(timeSeconds: number): void;
  dispose(): void;
}

const BAR_MIN_PX = 4;
const BAR_MAX_PX = 26;
const BAR_IDLE_PX = 3;

/** Binds the radio console markup to a Radio: labels from its store, clicks back to its methods. */
export function bindRadioConsole(radio: Radio): RadioConsole {
  const freq = requireEl('station-freq');
  const name = requireEl('station-name');
  const genre = requireEl('station-genre');
  const phase = requireEl('station-phase');
  const power = requireEl('radio-power');
  const bars = [...document.querySelectorAll<HTMLElement>('.eq-bar')];

  const render = (): void => {
    const { muted, phase: phaseName } = radio.store.get();
    const station = radio.station;
    freq.textContent = station.freq;
    name.textContent = station.name;
    genre.textContent = station.genre;
    phase.textContent = phaseName;
    power.dataset.state = muted ? 'muted' : 'on';
    power.setAttribute('aria-pressed', String(muted));
  };

  const abort = new AbortController();
  const { signal } = abort;
  requireEl('radio-prev').addEventListener(
    'click',
    () => {
      radio.changeStation(-1);
    },
    { signal },
  );
  requireEl('radio-next').addEventListener(
    'click',
    () => {
      radio.changeStation(1);
    },
    { signal },
  );
  power.addEventListener(
    'click',
    () => {
      radio.toggleMute();
    },
    { signal },
  );
  requireEl('radio-volume').addEventListener(
    'input',
    (e) => {
      radio.setVolume(Number((e.target as HTMLInputElement).value));
    },
    { signal },
  );

  const unsubscribe = radio.store.subscribe(render);
  render();

  return {
    updateVisualizer(time) {
      const { started, muted } = radio.store.get();
      const active = started && !muted;
      bars.forEach((bar, i) => {
        if (!active) {
          bar.style.height = `${BAR_IDLE_PX}px`;
          return;
        }
        const wave = Math.sin(time * 9 + i * 1.1) * 0.5 + 0.5;
        const jitter = Math.cos(time * 15 - i * 0.7) * 0.3 + 0.3;
        const h = Math.max(
          BAR_MIN_PX,
          Math.min(BAR_MAX_PX, Math.floor((wave * 0.65 + jitter * 0.35) * BAR_MAX_PX)),
        );
        bar.style.height = `${h}px`;
      });
    },
    dispose() {
      abort.abort();
      unsubscribe();
    },
  };
}
