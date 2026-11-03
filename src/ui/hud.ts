import { createStore, type Store } from '../core/store';
import { requireEl } from './dom';
import { ToastQueue, type Scheduler, type ToastView } from './toastQueue';

/** What the HUD displays. Written by the app, read only by the HUD (one-way flow). */
export interface HudState {
  cruiseControl: boolean;
  laneAssist: boolean;
  cameraLabel: string;
  biomeName: string;
  biomeDotColor: string;
  zen: boolean;
  landform: string;
  skyPhase: string;
  speedText: string;
  gearText: string;
  odometerText: string;
}

export const INITIAL_HUD: HudState = {
  cruiseControl: true,
  laneAssist: true,
  cameraLabel: 'Chase Cam',
  biomeName: 'Outrun Sunset',
  biomeDotColor: '#f43f5e',
  zen: false,
  landform: 'Alpine Peaks',
  skyPhase: 'Golden Sunset',
  speedText: '118',
  gearText: 'GEAR D5',
  odometerText: '0.0',
};

/** DOM-backed toast: visibility is a data attribute, the transition lives in CSS. */
class DomToast implements ToastView {
  constructor(
    private readonly banner: HTMLElement,
    private readonly text: HTMLElement,
  ) {}
  show(message: string): void {
    this.text.textContent = message;
    this.banner.dataset.visible = 'true';
  }
  hide(): void {
    this.banner.dataset.visible = 'false';
  }
}

export interface Hud {
  readonly store: Store<HudState>;
  toast(message: string): void;
}

/**
 * Binds the HUD markup to a store. State is expressed as `data-*` attributes and `inert`; all
 * styling is in CSS (src/styles/main.css), not in class strings built here.
 */
export function createHud(scheduler: Scheduler = window): Hud {
  const store = createStore<HudState>({ ...INITIAL_HUD });
  const toasts = new ToastQueue(new DomToast(requireEl('toast-banner'), requireEl('toast-text')), scheduler);

  const cruise = requireEl('btn-cruise');
  const cruiseLabel = requireEl('cruise-label');
  const assist = requireEl('btn-autosteer');
  const assistLabel = requireEl('autosteer-label');
  const bottomHud = requireEl('bottom-hud');
  const biomeLabel = requireEl('current-biome-label');
  const biomeDot = requireEl('biome-indicator-dot');
  const cameraLabel = requireEl('camera-label');
  const landform = requireEl('landform-label');
  const skyPhase = requireEl('time-phase-label');
  const speed = requireEl('speed-display');
  const gear = requireEl('gear-display');
  const odometer = requireEl('odometer-val');

  const setText = (el: HTMLElement, text: string): void => {
    if (el.textContent !== text) el.textContent = text; // avoids per-frame DOM writes
  };

  const render = (s: HudState): void => {
    cruise.dataset.state = s.cruiseControl ? 'on' : 'off';
    cruise.setAttribute('aria-pressed', String(s.cruiseControl));
    setText(cruiseLabel, s.cruiseControl ? 'CRUISE: ON' : 'CRUISE: OFF');
    assist.dataset.state = s.laneAssist ? 'on' : 'off';
    assist.setAttribute('aria-pressed', String(s.laneAssist));
    setText(assistLabel, s.laneAssist ? 'LANE ASSIST: ON' : 'LANE ASSIST: OFF');

    // Zen mode hides the dashboard. `inert` also removes it from pointer, focus and a11y trees,
    // which the old pointer-events assignment failed to do (BUG-002).
    document.body.dataset.zen = String(s.zen);
    bottomHud.inert = s.zen;

    setText(biomeLabel, s.biomeName);
    biomeDot.style.backgroundColor = s.biomeDotColor;
    biomeDot.style.boxShadow = `0 0 10px ${s.biomeDotColor}`;
    setText(cameraLabel, s.cameraLabel);
    setText(landform, s.landform);
    setText(skyPhase, s.skyPhase);
    setText(speed, s.speedText);
    setText(gear, s.gearText);
    setText(odometer, s.odometerText);
  };

  store.subscribe(render);
  render(store.get());
  return {
    store,
    toast: (message) => {
      toasts.push(message);
    },
  };
}
