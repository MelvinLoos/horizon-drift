import { Color } from 'three';
import type { Biome, PaletteKey } from '../config/biomes';

/** Converts a record of 24-bit hex colours into `THREE.Color`s (fresh instances, safe to mutate). */
export function paletteToColors<K extends string>(palette: Readonly<Record<K, number>>): Record<K, Color> {
  const out = {} as Record<K, Color>;
  for (const key of Object.keys(palette) as K[]) out[key] = new Color(palette[key]);
  return out;
}

export type BiomeWithColors = Omit<Biome, 'palette'> & Record<PaletteKey, Color>;

/** A biome with its palette as `THREE.Color` fields (`biome.skyTop`, …), the shape the renderer uses. */
export function withThreeColors(biome: Biome): BiomeWithColors {
  const { palette, ...rest } = biome;
  return { ...rest, ...paletteToColors(palette) };
}
