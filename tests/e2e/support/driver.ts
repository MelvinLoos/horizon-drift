import type { Page } from '@playwright/test';
import { FRAME_MS, freezeClock, seedRandom } from './determinism';

export type Target = 'legacy' | 'app';

export const TARGET: Target = process.env.TARGET === 'app' ? 'app' : 'legacy';
export const ENTRY_PATH = TARGET === 'legacy' ? '/legacy/index.html' : '/';

/**
 * Test hooks every build must expose on `window.__HD__` (the app exposes them in
 * non-production builds; for the legacy prototype `installLegacyHooks` shims them).
 * Keeping one contract lets the same specs and screenshot baselines gate both targets.
 */
export interface HdHooks {
  setBiome(index: number): void;
  setSkyTime(p: number, frozen: boolean): void;
  setCamera(index: number): void;
  hideIgnitionOverlay(): void;
  framesRendered(): number;
}

declare global {
  interface Window {
    __HD__?: HdHooks;
  }
}

/** Defines `window.__HD__` on the legacy page using its top-level (lexical) globals. */
async function installLegacyHooks(page: Page): Promise<void> {
  // A string, because the legacy globals (state, BIOMES, …) are not visible to TypeScript.
  await page.evaluate(`
    let frames = 0;
    const render = renderer.render.bind(renderer);
    renderer.render = (...args) => { frames++; return render(...args); };
    window.__HD__ = {
      framesRendered() { return frames; },
      setBiome(i) {
        state.currentBiomeIdx = i;
        state.targetBiomeIdx = i;
        state.biomeLerp = 1;
        const b = BIOMES[i];
        document.getElementById('current-biome-label').textContent = b.name;
        const dot = document.getElementById('biome-indicator-dot');
        dot.style.backgroundColor = b.dotColor;
        dot.style.boxShadow = '0 0 10px ' + b.dotColor;
      },
      setSkyTime(p, frozen) {
        state.celestialTime = p;
        if (frozen) state.celestialSpeed = 0;
      },
      setCamera(i) {
        state.cameraMode = i;
        document.getElementById('camera-label').textContent = CAMERA_MODES[i];
      },
      hideIgnitionOverlay() {
        document.getElementById('ignition-overlay').style.display = 'none';
      },
    };
  `);
}

export interface OpenOptions {
  deterministic?: boolean;
  seed?: number;
}

/** Opens the app under test. Deterministic mode seeds Math.random and fakes the clock. */
export async function openApp(page: Page, opts: OpenOptions = {}): Promise<void> {
  if (opts.deterministic) {
    await seedRandom(page, opts.seed);
    await freezeClock(page);
  }
  await page.goto(ENTRY_PATH);
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  if (TARGET === 'legacy') await installLegacyHooks(page);
  await page.waitForFunction(() => window.__HD__ !== undefined);
}

/** Hooks that act on the scene (as opposed to queries such as `framesRendered`). */
type VoidHook = Exclude<keyof HdHooks, 'framesRendered'>;

export async function framesRendered(page: Page): Promise<number> {
  return page.evaluate(() => window.__HD__?.framesRendered() ?? 0);
}

export async function hooks<K extends VoidHook>(
  page: Page,
  name: K,
  ...args: Parameters<HdHooks[K]>
): Promise<void> {
  await page.evaluate(
    ([n, a]) => {
      const fn = window.__HD__?.[n] as ((...x: unknown[]) => void) | undefined;
      if (!fn) throw new Error(`__HD__.${n} missing`);
      fn(...a);
    },
    [name, args] as const,
  );
}

/** Advances the fake clock by whole frames (requires deterministic mode). */
export async function stepFrames(page: Page, frames: number): Promise<void> {
  await page.clock.runFor(Math.ceil(frames * FRAME_MS));
}
