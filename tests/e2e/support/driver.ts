import { test, type Page } from '@playwright/test';
import type { HdHooks } from '../../../src/testing/testHooks';
import { freezeClock, seedRandom } from './determinism';

export type Target = 'legacy' | 'app';

/**
 * Which build the current test runs against, from the Playwright project (`legacy` | `app`).
 * Both expose the same `window.__HD__` contract (src/testing/testHooks.ts); for the prototype,
 * `installLegacyHooks` shims it. One contract lets the same specs and baselines gate both.
 */
export function currentTarget(): Target {
  return test.info().project.metadata.target === 'app' ? 'app' : 'legacy';
}

function entryPath(target: Target): string {
  return target === 'legacy' ? 'legacy/index.html' : './';
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
      advanceFrames(count) {
        const step = 1 / 60;
        clock.getDelta = () => { clock.elapsedTime += step; return step; };
        clock.getElapsedTime = () => clock.elapsedTime;
        const draw = renderer.render;
        renderer.render = () => {};
        try {
          for (let i = 0; i < count; i++) { if (i === count - 1) renderer.render = draw; animate(); }
        } finally { renderer.render = draw; }
      },
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
  const target = currentTarget();
  await page.goto(entryPath(target));
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  if (target === 'legacy') await installLegacyHooks(page);
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

/**
 * Renders exactly `frames` frames with a fixed 1/60 s timestep (requires deterministic mode, so
 * the paused fake clock keeps the app's own requestAnimationFrame loop from running).
 */
export async function stepFrames(page: Page, frames: number): Promise<void> {
  await hooks(page, 'advanceFrames', frames);
}
