import { expect, test, type Page } from '@playwright/test';
import { currentTarget, framesRendered, openApp, stepFrames } from './support/driver';

/** Collects uncaught exceptions and console errors for the lifetime of the page. */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

/** The legacy page fades the dashboard with inline style; the app also makes it `inert`. */
async function expectDashboardHidden(page: Page): Promise<void> {
  const hud = page.locator('#bottom-hud');
  if (currentTarget() === 'legacy') await expect(hud).toHaveAttribute('style', /opacity: 0/);
  else await expect(hud).toHaveAttribute('inert', '');
}

async function startEngine(page: Page): Promise<void> {
  await page.getByRole('button', { name: /start engine/i }).click();
  await expect(page.locator('#ignition-overlay')).toBeHidden({ timeout: 10_000 });
}

test.describe('smoke', () => {
  test('loads and renders frames without errors', async ({ page }) => {
    const errors = trackErrors(page);
    await openApp(page);
    await expect(page.locator('#canvas-container canvas')).toBeVisible();
    await expect.poll(() => framesRendered(page), { timeout: 15_000 }).toBeGreaterThan(3);
    expect(errors).toEqual([]);
  });

  test('start button hides the ignition overlay and announces the station', async ({ page }) => {
    const errors = trackErrors(page);
    await openApp(page);
    await startEngine(page);
    await expect(page.locator('#toast-text')).toContainText('ENGINE STARTED');
    expect(errors).toEqual([]);
  });

  test('keyboard shortcuts update the HUD', async ({ page }) => {
    await openApp(page);
    await startEngine(page);

    await page.keyboard.press('KeyB');
    await expect(page.locator('#current-biome-label')).toHaveText('Desert Golden Hour');

    await page.keyboard.press('KeyV');
    await expect(page.locator('#camera-label')).toHaveText('Bonnet View');

    await page.keyboard.press('KeyC');
    await expect(page.locator('#btn-cruise')).toContainText('CRUISE: OFF');

    await page.keyboard.press('KeyR');
    await expect(page.locator('#station-name')).toHaveText('Canyon Lo-Fi Chill');

    await page.keyboard.press('KeyH');
    await expectDashboardHidden(page);
  });

  test('dashboard buttons work with the mouse', async ({ page }) => {
    await openApp(page);
    await startEngine(page);

    await page.locator('#radio-next').click();
    await expect(page.locator('#station-name')).toHaveText('Canyon Lo-Fi Chill');
    await page.locator('#radio-prev').click();
    await expect(page.locator('#station-name')).toHaveText('Nightcall Synthwave');

    await page.locator('#btn-autosteer').click();
    await expect(page.locator('#btn-autosteer')).toHaveText('LANE ASSIST: OFF');
  });
});

test.describe('test hooks', () => {
  test('stepping frames leaves exactly one render loop running', async ({ page }) => {
    await openApp(page, { deterministic: true });
    const start = await framesRendered(page); // the app also counts its initial onload frame
    await stepFrames(page, 30);
    expect(await framesRendered(page)).toBe(start + 1); // only the last stepped frame is drawn
    await page.clock.runFor(100); // ≈ 6 frames of the app's own rAF loop
    const rendered = (await framesRendered(page)) - start - 1;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThanOrEqual(7); // 30 leaked loops would render ~180
  });
});

/**
 * Known bugs, reproduced. `test.fail()` means "this currently fails": when a fix lands the test
 * passes, Playwright reports it as unexpected, and the fix commit must remove the marker.
 */
test.describe('known bugs', () => {
  test('BUG-001: changing station before the engine starts throws', async ({ page }) => {
    test.fail();
    const errors = trackErrors(page);
    await openApp(page);
    await page.keyboard.press('KeyR');
    await expect(page.locator('#station-name')).toHaveText('Canyon Lo-Fi Chill');
    expect(errors).toEqual([]);
  });

  test('BUG-002: hidden dashboard must not be clickable in zen mode', async ({ page }) => {
    test.fail(currentTarget() === 'legacy', 'fixed in the app (2.4); the prototype keeps the bug');
    await openApp(page);
    await startEngine(page);
    await page.keyboard.press('KeyH');
    await expectDashboardHidden(page);
    await page.locator('#radio-next').click({ force: true });
    await expect(page.locator('#station-name')).toHaveText('Nightcall Synthwave');
  });

  test('BUG-003: holding a toggle key must not repeat the toggle', async ({ page }) => {
    test.fail(currentTarget() === 'legacy', 'fixed in the app (2.3); the prototype keeps the bug');
    await openApp(page);
    await startEngine(page);
    await page.keyboard.down('KeyV');
    await page.keyboard.down('KeyV'); // auto-repeat keydown (event.repeat === true)
    await page.keyboard.up('KeyV');
    await expect(page.locator('#camera-label')).toHaveText('Bonnet View');
  });
});
