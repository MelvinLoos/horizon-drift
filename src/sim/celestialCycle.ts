import { clamp } from '../core/math';

/**
 * The day/night cycle as pure functions of the cycle phase `p` in [0, 1):
 * 0 → 0.5 the sun rises, arcs across the sky and sets; 0.5 → 1 the moon does the same.
 */

/** Distance of the sun/moon disc from the player, in metres. */
export const CELESTIAL_DISTANCE = 1050;

export type SkyPhaseLabel =
  | 'Dawn Break'
  | 'Morning Gold'
  | 'High Daylight'
  | 'Golden Sunset'
  | 'Dusk & Sunset'
  | 'Twilight Moonrise'
  | 'Starlit Night'
  | 'Moonset & Pre-Dawn';

/** How much each palette contributes to the sky; the four weights sum to 1. */
export interface SkyWeights {
  /** The current biome's own golden-hour palette. */
  readonly golden: number;
  readonly day: number;
  readonly twilight: number;
  readonly night: number;
}

export interface CelestialState {
  /** 1 while the moon is up (second half of the cycle), else 0. */
  readonly isMoon: 0 | 1;
  /** Progress of the current body across the sky: 0 rise, 0.5 zenith, 1 set. */
  readonly bodyArc: number;
  /** sin(bodyArc · π): 0 at the horizon, 1 at the zenith. */
  readonly sinArc: number;
  /** Height of the disc above the player (below 0 = under the horizon). */
  readonly elevationY: number;
  /** Lateral drift of the disc across the forward horizon. */
  readonly lateralX: number;
  /** Disc opacity, fading out as it sinks below the horizon line. */
  readonly bodyOpacity: number;
  readonly weights: SkyWeights;
  readonly phaseLabel: SkyPhaseLabel;
}

/** Advances the cycle phase, wrapping into [0, 1) (also for negative dt or speed). */
export function advanceCelestialTime(p: number, dt: number, speed: number): number {
  const next = (p + dt * speed) % 1.0;
  // `%` keeps the dividend's sign; only wrap negatives so the common path stays bit-identical.
  return next < 0 ? next + 1.0 : next;
}

export function celestialState(p: number): CelestialState {
  const isMoon = p < 0.5 ? 0 : 1;
  const bodyArc = p < 0.5 ? p / 0.5 : (p - 0.5) / 0.5;

  // Rises from 55 m below the horizon to 215 m above it and back.
  const sinArc = Math.sin(bodyArc * Math.PI);
  const elevationY = -55.0 + sinArc * 270.0;
  const lateralX = Math.cos(bodyArc * Math.PI) * 145.0;
  const bodyOpacity = clamp((elevationY + 38.0) / 52.0, 0, 1);

  let golden = 0.0;
  let day = 0.0;
  let night = 0.0;
  let twilight = 0.0;
  let phaseLabel: SkyPhaseLabel;

  if (p < 0.5) {
    if (bodyArc > 0.18 && bodyArc < 0.82) {
      // Sun well above the horizon: golden hour fading into full daylight and back.
      day = Math.sin(((bodyArc - 0.18) / 0.64) * Math.PI);
      golden = 1.0 - day;
      phaseLabel = day > 0.55 ? 'High Daylight' : bodyArc < 0.5 ? 'Morning Gold' : 'Golden Sunset';
    } else {
      // Sunrise (bodyArc ≤ 0.18) or sunset (≥ 0.82): twilight blending into golden hour.
      const edgeT = bodyArc <= 0.18 ? bodyArc / 0.18 : (1.0 - bodyArc) / 0.18;
      golden = Math.sin(edgeT * Math.PI * 0.5);
      twilight = 1.0 - golden;
      phaseLabel = bodyArc < 0.5 ? 'Dawn Break' : 'Dusk & Sunset';
    }
  } else {
    night = Math.sin(bodyArc * Math.PI);
    twilight = 1.0 - night;
    phaseLabel =
      bodyArc < 0.15 ? 'Twilight Moonrise' : bodyArc > 0.85 ? 'Moonset & Pre-Dawn' : 'Starlit Night';
  }

  return {
    isMoon,
    bodyArc,
    sinArc,
    elevationY,
    lateralX,
    bodyOpacity,
    weights: { golden, day, twilight, night },
    phaseLabel,
  };
}

/** Scalar lighting values derived from the cycle (colours are blended by the renderer). */
export interface CelestialLighting {
  /** How strongly terrain colours darken towards their night anchors. */
  readonly darkFactor: number;
  /** Sky shader blend between day and night cloud lighting. */
  readonly nightFactor: number;
  readonly starOpacity: number;
  readonly sunIntensity: number;
  readonly hemiIntensity: number;
  /** Unit direction from the player to the sun/moon disc. */
  readonly celestialDir: readonly [number, number, number];
}

export function celestialLighting(state: CelestialState): CelestialLighting {
  const { golden, day, twilight, night } = state.weights;
  const darkFactor = night * 0.72 + twilight * 0.42;

  const dx = state.lateralX / CELESTIAL_DISTANCE;
  const dy = state.elevationY / CELESTIAL_DISTANCE;
  const dz = -1.0;
  // Same arithmetic as THREE.Vector3#normalize (multiplies by 1/length), so results stay identical.
  const invLength = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz);

  return {
    darkFactor,
    nightFactor: night + twilight * 0.5,
    // Bright at night and twilight, soft in golden hour, hidden in full daylight.
    starOpacity: clamp(night * 0.95 + twilight * 0.68 + golden * 0.22 - day * 0.35, 0.08, 0.95),
    sunIntensity: state.isMoon === 1 ? 0.55 + night * 0.35 : 1.15 + state.sinArc * 0.95,
    hemiIntensity: 0.48 + (1.0 - darkFactor) * 0.35,
    celestialDir: [dx * invLength, dy * invLength, dz * invLength],
  };
}
