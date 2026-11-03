/**
 * Captures "oracle" fixtures from the untouched legacy prototype (legacy/index.html).
 *
 * The prototype's helpers are classic-script globals, so they can be called directly in the
 * page. Logic that only exists inline in `animate()` (day/night cycle, driving physics) is
 * recorded frame by frame under a paused fake clock. Phase 2 unit tests check the extracted
 * TypeScript modules against these JSON files.
 *
 * Run: pnpm fixtures:legacy   (re-run only if the oracle itself changes — it should not)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { createServer } from 'vite';
import { FIXED_TIME, FRAME_MS } from '../tests/e2e/support/determinism';

const OUT_DIR = join(import.meta.dirname, '..', 'tests', 'fixtures', 'legacy');
const PORT = 5199;
const SEED = 1337;

function range(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let v = from; step > 0 ? v <= to : v >= to; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

/** z samples: dense near the start, sparse far out, plus very large distances. */
const Z_SAMPLES = [
  ...range(1000, -2000, -7.3),
  ...range(-2000, -60000, -611.7),
  -123456.789,
  -1_000_000,
  -5_000_000,
];
const X_OFFSETS = [-520, -300, -140, -60, -20, -11.3, -11.2, -5, 0, 5, 11.2, 11.3, 20, 60, 140, 300, 520];

async function openLegacy(page: Page): Promise<void> {
  await page.addInitScript((s: number) => {
    let a = s >>> 0;
    Math.random = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }, SEED);
  await page.clock.install({ time: FIXED_TIME });
  await page.clock.pauseAt(new Date(FIXED_TIME.getTime() + 1000));
  await page.goto(`http://localhost:${PORT}/legacy/index.html`);
  await page.waitForFunction('typeof getRoadX === "function" && typeof renderer !== "undefined"');
}

async function capturePure(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(
    `(() => {
      const Z = ${JSON.stringify(Z_SAMPLES)};
      const X = ${JSON.stringify(X_OFFSETS)};
      const road = Z.map((z) => ({ z, x: getRoadX(z), y: getRoadY(z), dx: getRoadDerivativeX(z) }));

      const hash = [];
      for (const x of [-4097, -2049, -1, 0, 1, 7, 2047, 2048, 4100, 123456])
        for (const z of [-3000, -1, 0, 3, 2048, 99999]) hash.push({ x, z, v: hash2D(x, z) });
      const noise = [];
      for (let x = -40; x <= 40; x += 3.37) for (let z = -40; z <= 40; z += 4.91)
        noise.push({ x, z, v: valueNoise(x, z) });

      const blend = Z.map((z) => ({ z, ...getLandformBlend(z) }));

      const height = [];
      const nSets = [[0, 0, 0], [0.5, 0.25, 0.11], [1, 0.5, 0.22], [0.31, 0.07, 0.19], [0.77, 0.41, 0.03]];
      for (let type = 0; type < 6; type++)
        for (const [n1, n2, n3] of nSets)
          for (const dist of [11.2, 20, 66, 140, 300, 520])
            for (const z of [-50, -1234.5, -9876])
              for (const side of [-1, 1]) {
                const worldX = getRoadX(z) + side * dist;
                height.push({ type, worldX, worldZ: z, dist, n1, n2, n3, v: evalLandformHeight(type, worldX, z, dist, n1, n2, n3) });
              }

      const elevation = [];
      for (const z of Z.filter((_, i) => i % 9 === 0))
        for (const off of X) {
          const worldX = getRoadX(z) + off;
          elevation.push({ worldX, worldZ: z, dist: Math.abs(off), v: getTerrainElevationOffset(worldX, z, Math.abs(off)) });
        }

      return { road, hash, noise, blend, height, elevation };
    })()`,
  );
}

/** Installs a per-frame recorder by wrapping renderer.render (runs at the end of animate()). */
async function installRecorder(page: Page, body: string): Promise<void> {
  await page.evaluate(`(() => {
    window.__frames = [];
    let lastElapsed = clock.elapsedTime;
    const render = renderer.render.bind(renderer);
    renderer.render = (...args) => {
      const dt = clock.elapsedTime - lastElapsed;
      lastElapsed = clock.elapsedTime;
      window.__frames.push((() => { ${body} })());
      return render(...args);
    };
  })()`);
}

async function stepFrames(page: Page, frames: number): Promise<void> {
  await page.clock.runFor(Math.ceil(frames * FRAME_MS));
}

async function captureCelestial(page: Page): Promise<unknown[]> {
  await installRecorder(
    page,
    `const c = (col) => [col.r, col.g, col.b];
     return {
       p: state.celestialTime,
       phaseLabel: document.getElementById('time-phase-label').textContent,
       nightFactor: skyUniforms.uNightFactor.value,
       celestialDir: skyUniforms.uCelestialDir.value.toArray(),
       isMoon: sunUniforms.uIsMoon.value,
       bodyOpacity: sunUniforms.uOpacity.value,
       starOpacity: starMat.opacity,
       dirIntensity: dirLight.intensity,
       hemiIntensity: hemiLight.intensity,
       skyTop: c(liveColors.skyTop), skyMid: c(liveColors.skyMid), skyHorizon: c(liveColors.skyHorizon),
       fog: c(liveColors.fogColor), sun: c(liveColors.sunColor),
       terrain: c(liveColors.terrainColor), mountain: c(liveColors.mountainColor), peak: c(liveColors.peakColor),
     };`,
  );
  const samples: unknown[] = [];
  for (let i = 0; i < 100; i++) {
    await page.evaluate(`state.celestialSpeed = 0; state.celestialTime = ${i / 100};`);
    await stepFrames(page, 1);
    samples.push(await page.evaluate('window.__frames.at(-1)'));
  }
  return samples;
}

interface DriveSegment {
  label: string;
  keys: string[];
  frames: number;
  setup?: string;
}

const DRIVE: DriveSegment[] = [
  { label: 'cruise', keys: [], frames: 60 },
  { label: 'throttle', keys: ['KeyW'], frames: 90 },
  { label: 'brake', keys: ['KeyS'], frames: 60 },
  { label: 'steer-left', keys: ['KeyA'], frames: 40 },
  { label: 'steer-right', keys: ['ArrowRight'], frames: 40 },
  { label: 'lane-assist-return', keys: [], frames: 90 },
  { label: 'coast', keys: [], frames: 60, setup: 'state.cruiseControl = false;' },
  { label: 'manual-steer', keys: ['KeyA'], frames: 30, setup: 'state.laneAssist = false;' },
  { label: 'manual-drift', keys: [], frames: 60 },
  { label: 'hard-brake-to-stop', keys: ['KeyS'], frames: 240 },
];

async function captureDrive(page: Page): Promise<unknown> {
  await installRecorder(
    page,
    `return {
       dt,
       speedKmh: state.speedKmh, cruiseSpeedKmh: state.cruiseSpeedKmh,
       cruiseControl: state.cruiseControl, laneAssist: state.laneAssist,
       zPos: state.zPos, distanceKm: state.distanceKm,
       lateralOffset: state.lateralOffset, lateralVelocity: state.lateralVelocity,
       carPosition: carGroup.position.toArray(),
       carRotation: [carGroup.rotation.x, carGroup.rotation.y, carGroup.rotation.z],
       speedText: document.getElementById('speed-display').textContent,
       gearText: document.getElementById('gear-display').textContent,
     };`,
  );
  const segments: { label: string; keys: string[]; frames: unknown[] }[] = [];
  for (const seg of DRIVE) {
    await page.evaluate(
      `for (const k of Object.keys(keys)) keys[k] = false;
       for (const k of ${JSON.stringify(seg.keys)}) keys[k] = true;
       ${seg.setup ?? ''}
       window.__frames = [];`,
    );
    await stepFrames(page, seg.frames);
    segments.push({ label: seg.label, keys: seg.keys, frames: await page.evaluate('window.__frames') });
  }
  return { initial: { speedKmh: 118, cruiseSpeedKmh: 120 }, segments };
}

async function main(): Promise<void> {
  const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'warn' });
  await server.listen();
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    await mkdir(OUT_DIR, { recursive: true });
    const meta = {
      source: 'legacy/index.html',
      seed: SEED,
      capturedWith: 'scripts/capture-legacy-fixtures.ts',
    };

    const page1 = await browser.newPage();
    await openLegacy(page1);
    const pure = await capturePure(page1);
    for (const [name, data] of Object.entries(pure)) await save(name, { meta, data });

    const page2 = await browser.newPage();
    await openLegacy(page2);
    await save('celestial', { meta: { ...meta, biome: 0 }, data: await captureCelestial(page2) });

    const page3 = await browser.newPage();
    await openLegacy(page3);
    await save('drive', { meta: { ...meta, frameMs: FRAME_MS }, data: await captureDrive(page3) });
  } finally {
    await browser.close();
    await server.close();
  }
}

async function save(name: string, payload: unknown): Promise<void> {
  const file = join(OUT_DIR, `${name}.json`);
  await writeFile(file, JSON.stringify(payload) + '\n');
  console.log(`wrote ${file}`);
}

await main();
