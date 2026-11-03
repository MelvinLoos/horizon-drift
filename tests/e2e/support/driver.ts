import { test, type Page } from '@playwright/test';
import { installTestHooks, type HdHooks } from '../../../src/testing/testHooks';
import { freezeClock, seedRandom } from './determinism';

export type Target = 'legacy' | 'app';

/**
 * Which build the current test runs against, from the Playwright project (`legacy` | `app`).
 * Both expose the same `window.__HD__` contract (src/testing/testHooks.ts); for the prototype,
 * `installLegacyHooks` injects it. One contract lets the same specs and baselines gate both.
 */
export function currentTarget(): Target {
  return test.info().project.metadata.target === 'app' ? 'app' : 'legacy';
}

function entryPath(target: Target): string {
  return target === 'legacy' ? 'legacy/index.html' : './';
}

/**
 * Installs the app's own `installTestHooks` into the legacy page, passing the prototype's
 * top-level (lexical) globals, so both targets run the exact same hook implementation.
 * Evaluated as a string because those globals are invisible to TypeScript.
 */
async function installLegacyHooks(page: Page): Promise<void> {
  await page.evaluate(
    `(${installTestHooks.toString()})({ state, BIOMES, CAMERA_MODES, renderer, clock, animate })`,
  );
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
