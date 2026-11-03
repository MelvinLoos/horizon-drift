import type { Page } from '@playwright/test';

/** Fixed epoch so Date-based code is reproducible. */
export const FIXED_TIME = new Date('2026-01-01T00:00:00Z');
export const DEFAULT_SEED = 1337;
export const FRAME_MS = 1000 / 60;

/**
 * Replaces Math.random with a seeded mulberry32 PRNG before any page script runs.
 * The legacy prototype uses Math.random for stars, the asphalt texture and the radio,
 * so seeding it is what makes screenshots and fixtures reproducible.
 */
export async function seedRandom(page: Page, seed = DEFAULT_SEED): Promise<void> {
  await page.addInitScript((s: number) => {
    let a = s >>> 0;
    Math.random = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }, seed);
}

/**
 * Installs Playwright's fake clock (Date, timers, rAF, performance.now) and pauses it, so frames
 * only render when a test advances time explicitly (see `stepFrames`).
 */
export async function freezeClock(page: Page): Promise<void> {
  await page.clock.install({ time: FIXED_TIME });
  await page.clock.pauseAt(new Date(FIXED_TIME.getTime() + 1000));
}
