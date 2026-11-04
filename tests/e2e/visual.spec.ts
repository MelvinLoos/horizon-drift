import { expect, test, type Page } from '@playwright/test';
import { hooks, openApp, stepFrames } from './support/driver';

/**
 * Visual baselines of the app (originally captured from the legacy prototype, re-approved from the
 * app in 2.5 — see ADR-0003). They only change in a commit named
 * `test(visual): update baselines — <why>`, after reviewing the diff.
 * Run inside the Playwright Docker image (`pnpm test:visual`) — GPU output differs per machine.
 */
const BIOMES = [
  'outrun-sunset',
  'desert-golden-hour',
  'alpine-starlight',
  'coastal-breeze',
  'aurora-borealis',
];
const CAMERAS = ['chase', 'bonnet', 'drone'];
const SKY = { dawn: 0.03, day: 0.25, golden: 0.42, night: 0.75 } as const;

async function scene(page: Page, biome: number, camera: number, sky: number): Promise<void> {
  await openApp(page, { deterministic: true });
  await hooks(page, 'hideIgnitionOverlay');
  await hooks(page, 'setBiome', biome);
  await hooks(page, 'setSkyTime', sky, true);
  await hooks(page, 'setCamera', camera);
  await stepFrames(page, 90); // let camera smoothing settle
}

const shot = { mask: [] as ReturnType<Page['locator']>[], timeout: 60_000 };

test.describe('visual', { tag: '@visual' }, () => {
  test.beforeEach(({ page }) => {
    shot.mask = [page.locator('#toast-banner')];
  });

  BIOMES.forEach((name, i) => {
    test(`biome ${name}`, async ({ page }) => {
      await scene(page, i, 0, SKY.golden);
      await expect(page).toHaveScreenshot(`biome-${name}.png`, shot);
    });
  });

  CAMERAS.slice(1).forEach((name, i) => {
    test(`camera ${name}`, async ({ page }) => {
      await scene(page, 0, i + 1, SKY.golden);
      await expect(page).toHaveScreenshot(`camera-${name}.png`, shot);
    });
  });

  (['dawn', 'day', 'night'] as const).forEach((phase) => {
    test(`sky ${phase}`, async ({ page }) => {
      await scene(page, 0, 0, SKY[phase]);
      await expect(page).toHaveScreenshot(`sky-${phase}.png`, shot);
    });
  });
});
