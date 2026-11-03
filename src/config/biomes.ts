/** The five selectable horizon biomes. Pure data: colours are 24-bit hex numbers. */

export const PALETTE_KEYS = [
  'skyTop',
  'skyMid',
  'skyHorizon',
  'fogColor',
  'sunColor',
  'terrainColor',
  'mountainColor',
  'peakColor',
  'gridColor',
  'roadStripeColor',
] as const;
export type PaletteKey = (typeof PALETTE_KEYS)[number];
export type BiomePalette = Readonly<Record<PaletteKey, number>>;

export const SCENERY_TYPES = ['palms', 'cacti', 'pines'] as const;
export type SceneryType = (typeof SCENERY_TYPES)[number];

export interface Biome {
  readonly name: string;
  /** CSS colour of the HUD indicator dot. */
  readonly dotColor: string;
  readonly palette: BiomePalette;
  readonly sceneryType: SceneryType;
  readonly sunElevation: number;
}

export const BIOMES = [
  {
    name: 'Outrun Sunset',
    dotColor: '#f43f5e',
    palette: {
      skyTop: 0x090418,
      skyMid: 0x3b1245,
      skyHorizon: 0xff5a36,
      fogColor: 0x4a1936,
      sunColor: 0xffb74d,
      terrainColor: 0x160d1e,
      mountainColor: 0x281533,
      peakColor: 0x6e3554,
      gridColor: 0xff4d6d,
      roadStripeColor: 0xffca3a,
    },
    sceneryType: 'palms',
    sunElevation: 0.14,
  },
  {
    name: 'Desert Golden Hour',
    dotColor: '#f59e0b',
    palette: {
      skyTop: 0x142238,
      skyMid: 0x8c4223,
      skyHorizon: 0xffaa4c,
      fogColor: 0x733a20,
      sunColor: 0xffe082,
      terrainColor: 0x331b11,
      mountainColor: 0x5c2c18,
      peakColor: 0x9e5231,
      gridColor: 0xf59e0b,
      roadStripeColor: 0xfbbf24,
    },
    sceneryType: 'cacti',
    sunElevation: 0.18,
  },
  {
    name: 'Alpine Starlight',
    dotColor: '#38bdf8',
    palette: {
      skyTop: 0x020612,
      skyMid: 0x0b192c,
      skyHorizon: 0x1e3f66,
      fogColor: 0x0f233d,
      sunColor: 0xe0f2fe,
      terrainColor: 0x0a1320,
      mountainColor: 0x192b42,
      peakColor: 0xcbd5e1,
      gridColor: 0x38bdf8,
      roadStripeColor: 0xf1f5f9,
    },
    sceneryType: 'pines',
    sunElevation: 0.22,
  },
  {
    name: 'Coastal Breeze',
    dotColor: '#2dd4bf',
    palette: {
      skyTop: 0x083d66,
      skyMid: 0x2b8cbe,
      skyHorizon: 0xffe8a3,
      fogColor: 0x6baed6,
      sunColor: 0xfffbeb,
      terrainColor: 0x13332f,
      mountainColor: 0x1f524c,
      peakColor: 0x648c85,
      gridColor: 0x2dd4bf,
      roadStripeColor: 0xffffff,
    },
    sceneryType: 'palms',
    sunElevation: 0.3,
  },
  {
    name: 'Aurora Borealis',
    dotColor: '#34d399',
    palette: {
      skyTop: 0x020813,
      skyMid: 0x062c36,
      skyHorizon: 0x10b981,
      fogColor: 0x082a33,
      sunColor: 0xa7f3d0,
      terrainColor: 0x06151c,
      mountainColor: 0x0f2f38,
      peakColor: 0x88b3ba,
      gridColor: 0x10b981,
      roadStripeColor: 0x6ee7b7,
    },
    sceneryType: 'pines',
    sunElevation: 0.16,
  },
] as const satisfies readonly Biome[];
