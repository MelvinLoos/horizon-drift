import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: 'tests/e2e',
  // Baselines are shared by every target (legacy prototype and the app): parity is the point.
  // They are only ever written from the `legacy` project (see `test:visual:update`).
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : '50%',
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  timeout: 90_000,
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' },
  },
  use: {
    baseURL: 'http://localhost:4173/',
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
  },
  projects: (['legacy', 'app'] as const).map((target) => ({
    name: target,
    metadata: { target },
    // Visual baselines belong to the app; the prototype only runs the functional specs.
    ...(target === 'legacy' ? { grepInvert: /@visual/ } : {}),
    use: {
      ...devices['Desktop Chrome'],
      viewport: { width: 1280, height: 720 },
      // Software WebGL so rendering is identical between machines (run visual tests in the
      // Playwright Docker image, see CONTRIBUTING.md).
      launchOptions: {
        args: [
          '--use-angle=swiftshader',
          '--enable-unsafe-swiftshader',
          '--autoplay-policy=no-user-gesture-required',
        ],
      },
    },
  })),
  // Tests run against the real production bundle, built in `e2e` mode so the test hooks are kept.
  webServer: {
    command: 'npx vite build --mode e2e --logLevel warn && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/legacy/index.html',
    // Always build fresh: a reused server could be a stale bundle or a production preview
    // (`pnpm preview`, same port) without the test hooks.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
