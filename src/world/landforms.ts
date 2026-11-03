import { saturate, smoothstep01 } from '../core/math';
import { LANDFORM_TYPES, ZONE_LENGTH } from '../config/landforms';
import { ROAD_CORRIDOR_BLEND, ROAD_CORRIDOR_HALF_WIDTH } from '../config/road';
import { HALF_WIDTH } from '../config/world';
import { valueNoise } from './noise';
import { roadX } from './road';

export interface LandformBlend {
  /** Landform of the current zone (index into LANDFORM_TYPES). */
  readonly idxA: number;
  /** Landform of the next zone. */
  readonly idxB: number;
  /** 0 → fully `idxA`, 1 → fully `idxB` (smoothstep across the zone). */
  readonly blend: number;
  /** Name of whichever landform dominates. */
  readonly activeName: string;
}

/** Which landforms are blended at road distance `z`. Zones of ZONE_LENGTH metres cycle through LANDFORM_TYPES. */
export function landformBlend(z: number): LandformBlend {
  const rawZone = Math.abs(z) / ZONE_LENGTH;
  const zoneIdx = Math.floor(rawZone);
  const blend = smoothstep01(rawZone - zoneIdx);
  const idxA = zoneIdx % LANDFORM_TYPES.length;
  const idxB = (zoneIdx + 1) % LANDFORM_TYPES.length;
  const dominant = LANDFORM_TYPES[blend < 0.5 ? idxA : idxB];
  return { idxA, idxB, blend, activeName: dominant?.name ?? '' };
}

/**
 * Height offset (relative to the road surface) of one landform at a point.
 * `n1`..`n3` are noise octaves sampled at that point; `distFromRoad` is |x − roadX(z)|.
 * The shape constants are art-directed, so they are documented rather than named.
 */
export function landformHeight(
  typeIdx: number,
  worldX: number,
  worldZ: number,
  distFromRoad: number,
  n1: number,
  n2: number,
  n3: number,
): number {
  // 0 at the corridor edge, 1 once the terrain is free to take its full shape.
  const roadCarve = smoothstep01(saturate((distFromRoad - ROAD_CORRIDOR_HALF_WIDTH) / ROAD_CORRIDOR_BLEND));
  // 0 at the corridor edge, 1 at the mesh edge: lets far terrain grow taller.
  const farT = saturate((distFromRoad - ROAD_CORRIDOR_HALF_WIDTH) / (HALF_WIDTH - ROAD_CORRIDOR_HALF_WIDTH));
  const farMargin = Math.pow(farT, 1.25);

  switch (typeIdx) {
    case 0: {
      // Alpine peaks: jagged ridges (ridged noise) towering towards the horizon.
      const ridge = 1.0 - Math.abs((n1 + n2 * 0.6) * 2.0 - 1.0);
      const sharpPeak = Math.pow(Math.max(0, ridge), 1.85);
      return (sharpPeak * 185.0 + n3 * 42.0 + 18.0) * farMargin;
    }
    case 1: {
      // Rolling foothills: soft sine undulations perturbed by noise.
      const waves = Math.sin(worldX * 0.012 + n1 * 2.2) * 22.0 + Math.cos(worldZ * 0.011 + n2 * 2.0) * 18.0;
      return (waves + n1 * 38.0 + n2 * 16.0 + 6.0) * roadCarve;
    }
    case 2: {
      // Canyon gorge: terraced cliffs on the right, a chasm dropping away on the left.
      const terraceRaw = (n1 * 0.75 + n2 * 0.25) * 6.0;
      const terracedSteps =
        (Math.floor(terraceRaw) + Math.pow(terraceRaw - Math.floor(terraceRaw), 4.0)) / 6.0;
      const canyonWall = terracedSteps * 155.0 + 25.0;
      const gorgeDepth =
        -48.0 * Math.sin(Math.min(1.0, distFromRoad / 140.0) * Math.PI) + canyonWall * farMargin;
      return worldX > roadX(worldZ) ? canyonWall * roadCarve : gorgeDepth * roadCarve;
    }
    case 3: {
      // Prairie plains: gentle dunes, distant buttes near the horizon.
      const gentleDunes = (n1 - 0.35) * 14.0 + n2 * 8.0;
      const distantRange = Math.pow(farT, 3.2) * (n1 * 95.0 + 20.0);
      return (gentleDunes + distantRange) * roadCarve;
    }
    case 4: {
      // Mesas: flat-topped plateaus with a second tier and steep escarpments.
      const combined = n1 * 0.8 + n2 * 0.25;
      const flatTop = smoothstep01(saturate((combined - 0.38) * 5.5));
      const secondTier = saturate((combined - 0.68) * 7.0);
      return (flatTop * 85.0 + secondTier * 55.0 + n3 * 8.0) * roadCarve;
    }
    default: {
      // River valley (5): the road runs along a ridge above sunken basins.
      const valleyBasin = -42.0 * (1.0 - farMargin) + (n1 * 130.0 + n2 * 35.0) * Math.pow(farT, 1.7);
      return (valleyBasin + n3 * 14.0) * roadCarve;
    }
  }
}

/** Terrain height relative to the road surface; 0 inside the road corridor. */
export function terrainElevation(worldX: number, worldZ: number, distFromRoad: number): number {
  if (distFromRoad <= ROAD_CORRIDOR_HALF_WIDTH) return 0;

  const n1 = valueNoise(worldX * 0.0068, worldZ * 0.0068);
  const n2 = valueNoise(worldX * 0.018 + 15.3, worldZ * 0.018 + 9.1) * 0.5;
  const n3 = valueNoise(worldX * 0.045 - 7.4, worldZ * 0.045 + 21.8) * 0.22;

  const { idxA, idxB, blend } = landformBlend(worldZ);
  const hA = landformHeight(idxA, worldX, worldZ, distFromRoad, n1, n2, n3);
  const hB = landformHeight(idxB, worldX, worldZ, distFromRoad, n1, n2, n3);
  return hA + (hB - hA) * blend;
}
