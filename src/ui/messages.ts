import type { Station } from '../config/stations';

/** Toast shown when the engine starts, naming the station that is actually tuned (BUG-007). */
export function engineStartMessage(station: Pick<Station, 'freq' | 'name'>): string {
  return `ENGINE STARTED • ${station.freq} ${station.name.toUpperCase()}`;
}

export function cruiseMessage(on: boolean, speedKmh: number): string {
  return on ? `CRUISE CONTROL SET AT ${speedKmh} KM/H` : 'CRUISE CONTROL OFF';
}

export function laneAssistMessage(on: boolean): string {
  return on ? 'COMFORT LANE ASSIST ENABLED' : 'MANUAL STEERING MODE';
}

export function headlightsMessage(on: boolean): string {
  return on ? 'POP-UP HEADLIGHTS UP' : 'POP-UP HEADLIGHTS RETRACTED';
}

export function zenMessage(on: boolean): string {
  return on ? 'ZEN HORIZON VIEW (PRESS H TO RESTORE)' : 'DASHBOARD RESTORED';
}
