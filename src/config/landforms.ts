/** Landforms the terrain morphs through along the road. Order matters: zones cycle through it. */

export interface Landform {
  readonly name: string;
  readonly id: 'mountains' | 'hills' | 'canyon' | 'plains' | 'mesas' | 'valley';
}

export const LANDFORM_TYPES = [
  { name: 'Alpine Peaks', id: 'mountains' },
  { name: 'Rolling Foothills', id: 'hills' },
  { name: 'Grand Canyon Gorge', id: 'canyon' },
  { name: 'Sweeping Prairie Plains', id: 'plains' },
  { name: 'Red-Rock Mesas & Plateaus', id: 'mesas' },
  { name: 'Sunken River Valley', id: 'valley' },
] as const satisfies readonly Landform[];

/** Metres of road per landform zone; neighbouring zones blend with a smoothstep. */
export const ZONE_LENGTH = 900;
