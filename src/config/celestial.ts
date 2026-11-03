/**
 * Colour anchors of the day/night cycle (24-bit hex). The live sky blends the current biome's
 * golden-hour palette with these day, twilight and night anchors.
 */
export const CELESTIAL_PALETTE = {
  daySkyTop: 0x0c3c78,
  daySkyMid: 0x3882c2,
  dayHorizon: 0xffe4a0,
  daySun: 0xfffbeb,
  twilightTop: 0x050517,
  twilightMid: 0x25123e,
  twilightHorizon: 0xc83e5b,
  nightTop: 0x02040a,
  nightMid: 0x071124,
  nightHorizon: 0x122747,
  moonColor: 0xbfdbfe,
  nightTerrain: 0x050912,
  nightMountain: 0x0d192b,
  nightPeak: 0x64748b,
} as const satisfies Readonly<Record<string, number>>;

export type CelestialPaletteKey = keyof typeof CELESTIAL_PALETTE;
