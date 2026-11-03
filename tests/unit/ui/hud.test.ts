// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { RADIO_STATIONS } from '../../../src/config/stations';
import { requireEl } from '../../../src/ui/dom';
import { createHud } from '../../../src/ui/hud';
import {
  cruiseMessage,
  engineStartMessage,
  headlightsMessage,
  laneAssistMessage,
  zenMessage,
} from '../../../src/ui/messages';
import type { Scheduler } from '../../../src/ui/toastQueue';

const IDS = [
  'toast-banner',
  'toast-text',
  'btn-cruise',
  'cruise-label',
  'btn-autosteer',
  'autosteer-label',
  'bottom-hud',
  'current-biome-label',
  'biome-indicator-dot',
  'camera-label',
  'landform-label',
  'time-phase-label',
  'speed-display',
  'gear-display',
  'odometer-val',
];

const noTimers: Scheduler = { setTimeout: () => 0, clearTimeout: () => undefined, now: () => 0 };
const el = requireEl;

describe('HUD', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    for (const id of IDS) {
      const node = document.createElement('div');
      node.id = id;
      document.body.append(node);
    }
  });

  it('renders the initial state', () => {
    createHud(noTimers);
    expect(el('btn-cruise').dataset.state).toBe('on');
    expect(el('btn-cruise').getAttribute('aria-pressed')).toBe('true');
    expect(el('cruise-label').textContent).toBe('CRUISE: ON');
    expect(el('current-biome-label').textContent).toBe('Outrun Sunset');
    expect(el('bottom-hud').inert).toBe(false);
  });

  it('reflects toggles through data attributes, aria-pressed and labels, not class strings', () => {
    const { store } = createHud(noTimers);
    const className = el('btn-cruise').className;
    store.set({ cruiseControl: false, laneAssist: false });
    expect(el('btn-cruise').dataset.state).toBe('off');
    expect(el('btn-cruise').getAttribute('aria-pressed')).toBe('false');
    expect(el('cruise-label').textContent).toBe('CRUISE: OFF');
    expect(el('autosteer-label').textContent).toBe('LANE ASSIST: OFF');
    expect(el('btn-cruise').className).toBe(className);
  });

  it('makes the dashboard inert in zen mode and restores it (BUG-002)', () => {
    const { store } = createHud(noTimers);
    store.set({ zen: true });
    expect(el('bottom-hud').inert).toBe(true);
    store.set({ zen: false });
    expect(el('bottom-hud').inert).toBe(false);
  });

  it('moves focus out of the dashboard before making it inert', () => {
    const { store } = createHud(noTimers);
    const button = document.createElement('button');
    el('bottom-hud').append(button);
    button.focus();
    expect(document.activeElement).toBe(button);
    store.set({ zen: true });
    expect(document.activeElement).not.toBe(button);
  });

  it('only re-renders the sections whose state changed', () => {
    const { store } = createHud(noTimers);
    el('cruise-label').textContent = 'tampered';
    store.set({ speedText: '99' }); // must not touch the cruise section
    expect(el('cruise-label').textContent).toBe('tampered');
    store.set({ cruiseControl: false });
    expect(el('cruise-label').textContent).toBe('CRUISE: OFF');
  });

  it('updates readouts and the biome dot', () => {
    const { store } = createHud(noTimers);
    store.set({
      speedText: '150',
      gearText: 'GEAR D5',
      odometerText: '1.2',
      biomeName: 'Aurora Borealis',
      biomeDotColor: '#34d399',
    });
    expect(el('speed-display').textContent).toBe('150');
    expect(el('odometer-val').textContent).toBe('1.2');
    expect(el('current-biome-label').textContent).toBe('Aurora Borealis');
    expect(el('biome-indicator-dot').style.backgroundColor).not.toBe('');
  });

  it('shows toasts through the visibility attribute', () => {
    const hud = createHud(noTimers);
    hud.toast('HELLO');
    expect(el('toast-text').textContent).toBe('HELLO');
    expect(el('toast-banner').dataset.visible).toBe('true');
  });
});

describe('messages', () => {
  it('names the tuned station in the start toast instead of a hard-coded one (BUG-007)', () => {
    for (const station of RADIO_STATIONS) {
      const message = engineStartMessage(station);
      expect(message).toContain(station.freq);
      expect(message).toContain(station.name.toUpperCase());
    }
  });

  it('describes toggle states', () => {
    expect(cruiseMessage(true, 120)).toBe('CRUISE CONTROL SET AT 120 KM/H');
    expect(cruiseMessage(false, 120)).toBe('CRUISE CONTROL OFF');
    expect(laneAssistMessage(false)).toBe('MANUAL STEERING MODE');
    expect(headlightsMessage(true)).toContain('UP');
    expect(zenMessage(true)).toContain('PRESS H');
  });
});
