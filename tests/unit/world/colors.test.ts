import { Color } from 'three';
import { describe, expect, it } from 'vitest';
import { BIOMES, PALETTE_KEYS } from '../../../src/config/biomes';
import { paletteToColors, withThreeColors } from '../../../src/world/colors';

describe('colour adapters', () => {
  it('converts every palette entry to an equal THREE.Color', () => {
    const colors = paletteToColors({ a: 0xff5a36, b: 0x000000 });
    expect(colors.a).toBeInstanceOf(Color);
    expect(colors.a.getHex()).toBe(0xff5a36);
    expect(colors.b.getHex()).toBe(0);
  });

  it('flattens a biome palette into Color fields and keeps the other fields', () => {
    const [biome] = BIOMES;
    const result = withThreeColors(biome);
    for (const key of PALETTE_KEYS) expect(result[key].getHex()).toBe(biome.palette[key]);
    expect(result.name).toBe(biome.name);
    expect(result.sceneryType).toBe(biome.sceneryType);
    expect(result).not.toHaveProperty('palette');
  });

  it('returns fresh instances that are safe to mutate', () => {
    const a = withThreeColors(BIOMES[0]);
    const b = withThreeColors(BIOMES[0]);
    a.skyTop.setHex(0x123456);
    expect(b.skyTop.getHex()).toBe(BIOMES[0].palette.skyTop);
  });
});
