# Horizon Drift — plan to refactor into a maintainable, standardized web app

## Context

`index.html` (2,586 lines, 135 KB) is the whole app. "Horizon Drift" is an endless 3D road trip: a three.js world with a curving road, six landforms that morph into each other, five biomes and a day/night cycle, plus a generative Tone.js "car radio" with five stations. It works, but it was vibecoded:

- **No engineering basics:** no git, no package manager, no build, no types, no tests, no lint.
- **Runtime CDNs:** Tailwind Play CDN (dev only, runs in the browser), three.js **r128** (2021; `outputEncoding`/`sRGBEncoding` are gone from current three.js) and Tone 14.8.49. Nothing is pinned through a lockfile and the scripts have no integrity checks.
- **One global script:** about 60 top-level globals. `CarRadio` writes to the DOM and calls the global `showToast()`. Toggles change UI state by assigning hard-coded Tailwind `className` strings. Simulation, rendering, audio, input and UI are all tangled together inside `animate()`.
- **Known bugs:**
  - Zen mode sets `pointerEvents` to `'none'` in both branches, so the hidden dashboard stays clickable.
  - No `touchcancel` or `mouseleave` handling, so keys can stay stuck.
  - Key auto-repeat re-triggers toggles (no `e.repeat` check).
  - `tickStep` swallows every error.
  - The start toast is hard-coded to "88.5 FM".
  - `[0,1,2]` is hard-coded where `progressions.length` should be used.
  - `hatSynth.envelope.decay` is changed at schedule time.
  - "Mute" stops note generation instead of muting.
  - Shadow maps are enabled, but nothing casts or receives shadows.
  - Float32 positions start to jitter after long drives (|z| ≫ 100 km).
- **Performance:**
  - The full terrain is rebuilt every frame: 17.8k vertices, with noise and `computeVertexNormals`.
  - `new THREE.Color` is created inside the per-vertex loop, and `new Vector3` per frame.
  - About 2,000 scenery meshes are built, most of them always hidden.
  - The car is about 150 separate draw calls.
- **Accessibility:** `user-scalable=no`, icon-only buttons with no labels, no `aria-pressed`, no live region, no `prefers-reduced-motion`, and `user-select:none` applied to everything.

**Goal:** the same experience, rebuilt as a typed, modular Vite + TypeScript app with automated quality gates, delivered in small, verifiable steps.

**Decisions made:**

- Vanilla TypeScript UI with a small typed store
- Tailwind v4 compiled at build time
- GitHub + GitHub Actions + GitHub Pages
- Bugs are fixed as we go, each as its own test-backed commit

---

## Target architecture

The core rule is **pure logic → adapters → composition root**. Pure modules never import `three`, `tone` or the DOM, so they can be unit-tested in Node.

```
src/
  main.ts                    composition root (wires everything, nothing else)
  app/        App.ts (init/start/dispose, visibility pause), GameLoop.ts (rAF, dt clamp, injectable clock)
  core/       store.ts (typed observable store), events.ts (typed bus), rng.ts (seeded mulberry32), math.ts
  config/     biomes.ts, stations.ts, landforms.ts, celestial.ts, tuning.ts (all magic numbers, named)
  sim/        vehicle.ts (pure stepVehicle), celestialCycle.ts (pure p → weights/label/elevation)
  world/      noise.ts, road.ts, landforms.ts            ← pure
              terrain/ (TerrainMesh.ts, terrainColoring.ts), sky/ (SkyDome, CelestialBody, Starfield, *.glsl),
              scenery/, lighting.ts, BiomeBlender.ts      ← three adapters
  vehicle/    carModel.ts (buildCar() → {group, wheels, popUps, lights})
  camera/     CameraRig.ts (one strategy per mode: chase / bonnet / drone)
  audio/      composer/ (arrangement.ts, patterns.ts: pure, rng-injected → NoteEvent[])
              RadioEngine.ts (Tone graph only, no DOM), instruments.ts
  input/      InputController.ts (Pointer + Keyboard events → InputState + commands; keybindings.ts)
  ui/         dom.ts (typed requireEl), TopBar, Dashboard, RadioConsole, Toast, IgnitionOverlay, TouchControls
  styles/     main.css (Tailwind v4 + tokens + components)
```

Data flows one way. Input and UI dispatch actions to the store. The sim updates state each tick. Render, audio and UI subscribe and read from it. Nothing reaches back into another module's DOM.

---

## Phases

Each phase ends with a green CI run and a tagged release (`v0.N.0`).

### Phase 0: Safety net (the app code does not change)

1. `git init`, push to GitHub, protect `main`. Move the file untouched to `legacy/index.html`. It becomes the **behaviour oracle**.
2. Tooling:
   - Node LTS (`.nvmrc`), pnpm, TypeScript (`strict`, `noUncheckedIndexedAccess`)
   - ESLint flat config (`typescript-eslint` strict-type-checked), Prettier, `.editorconfig`
   - Vitest, Playwright, husky + lint-staged, commitlint (Conventional Commits)
3. **Legacy fixture capture** (`scripts/capture-legacy-fixtures.ts`). Playwright loads the legacy page with `Math.random` replaced by a seeded PRNG (`addInitScript`) and the clock faked (`page.clock`). The legacy functions are browser globals, so the script can dump `getRoadX/Y`, `valueNoise`, `getLandformBlend` and `getTerrainElevationOffset` over a grid of inputs to `tests/fixtures/*.json`. It also captures reference screenshots: 3 cameras × 5 biomes × 4 sky phases.
4. Playwright smoke tests against the legacy page:
   - it loads with no console errors
   - the Start button hides the overlay
   - B, V, C and R update their labels
5. CI (`.github/workflows/ci.yml`): install → typecheck → lint → format check → unit → build → e2e on Chromium with SwiftShader, inside the official Playwright Docker image so screenshots are reproducible.
6. Docs: `README`, `CONTRIBUTING.md` (the workflow below), `docs/adr/` (ADR-001 stack, ADR-002 architecture), and a PR template.

### Phase 1: Build migration (same behaviour, same library versions)

1. Set up Vite. `index.html` keeps the markup only; the script moves to `src/main.ts`, at first as a single `// @ts-nocheck` module so the move itself is a safe mechanical step.
2. Install from npm at the **same versions**: `three@0.128.0` and `tone@14.8.49` (confirm both resolve; r128 ships an ESM build). Upgrades happen in Phase 3.
3. Tailwind v4 through `@tailwindcss/vite`. Run `npx @tailwindcss/upgrade` on the markup (v3 → v4 renamed some utilities, e.g. `shadow-sm` → `shadow-xs`). Add `@source "../**/*.ts"`. Move the custom CSS (`.glass-panel`, `.radio-lcd`, the range slider, keyframes) into `@layer components`.
4. Self-host fonts (`@fontsource-variable/inter`, `@fontsource/jetbrains-mono`). Shaders go into `.glsl` files imported with `?raw`.
5. Deploy to GitHub Pages (`deploy.yml` on `main`, `base` set in the Vite config). Every merge goes live from here on.
6. **Gate:** the visual diff against the legacy screenshots stays within tolerance, and the smoke tests run against both `/` and `/legacy/`.

### Phase 2: Modularize and type (one PR per step, in dependency order)

Each step: extract → type → unit-test → delete the old code. Fixes ride along as separate commits (see Workflow).

| Step | Extract                                                                                                                               | Tests                                                                                                                            | Fixes in this step                                                                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2.1  | `config/*`: biomes, stations, landforms, tuning constants. Store colours as hex numbers and build `THREE.Color` in the adapters.      | Schema invariants: every progression has 4 chords, scale notes are valid, etc.                                                   | Name the magic numbers                                                                                                                                                                                 |
| 2.2  | `core/rng`, `core/math`, `world/noise`, `world/road`, `world/landforms`, `sim/celestialCycle`                                         | **Exact match against the Phase 0 legacy fixtures**, plus property tests (smoothstep blend in [0,1], road corridor flat ≤ 11.2)  | —                                                                                                                                                                                                      |
| 2.3  | `core/store`, `core/events`, `input/InputController` (Pointer Events, keybinding map)                                                 | Input mapping and command dispatch (jsdom)                                                                                       | `e.repeat` guard, `pointercancel`/`blur` release stuck keys, touch look-around that actually works                                                                                                     |
| 2.4  | `ui/*` components subscribed to the store; state shown through `data-state` + CSS, not `className` strings                            | DOM tests per component                                                                                                          | Zen-mode `pointer-events` bug, start toast built from the current station, toast queue (landform + station toasts currently overwrite each other)                                                      |
| 2.5  | `audio/composer` (pure, rng-injected) + `RadioEngine` (Tone only, receives callbacks)                                                 | Seeded event-sequence snapshots; invariants: notes in key, velocity in [0,1], phases cycle. Engine tested with `vi.mock('tone')` | Remove the silent catch (log in dev), use `progressions.length`, separate open/closed hat synths instead of changing the envelope, real mute (volume ramp) kept separate from "radio off", `dispose()` |
| 2.6  | `sim/vehicle` (pure `stepVehicle(state,input,dt)`) + `vehicle/carModel`                                                               | Physics: cruise converges, brake bottoms out at 0, lateral clamp, lane-assist pull                                               | —                                                                                                                                                                                                      |
| 2.7  | `camera/CameraRig` (strategy per mode)                                                                                                | Mode cycling; no NaN                                                                                                             | No per-frame `Vector3` allocations                                                                                                                                                                     |
| 2.8  | `world/terrain`, `sky`, `scenery`, `lighting`, `BiomeBlender`                                                                         | Visual baselines                                                                                                                 | No per-vertex `new Color`; drop the dead shadow-map config                                                                                                                                             |
| 2.9  | `app/App` + `GameLoop` composition root; `ResizeObserver`; pause and `Tone.context.suspend()` on `visibilitychange`; full `dispose()` | Lifecycle e2e                                                                                                                    | Remove `// @ts-nocheck` and **delete `legacy/`** (the fixtures stay committed)                                                                                                                         |

### Phase 3: Upgrade dependencies (one PR per library)

The adapters are isolated by now, so each upgrade only touches a few files.

- **three r128 → latest.**
  - `outputEncoding` → `outputColorSpace`.
  - Colour management is now on by default, so hex colours get converted from sRGB.
  - Since r155, lights use physical units and decay by default (legacy lighting mode was removed in r165).
  - `mergeBufferGeometries` was renamed `mergeGeometries`.
  - Retune colours and light intensities until the image looks like the old one, then **re-approve the visual baselines in a dedicated commit** after reviewing the Playwright diff report.
- **Tone 14 → 15.** Run the composer snapshot tests and do a manual listening check on all 5 stations.
- Set up Renovate (weekly, grouped, auto-merge patch updates once CI is green).

### Phase 4: Performance (measure first)

1. A `?debug` overlay showing frame time, draw calls, triangles and geometries from `renderer.info`. A Playwright perf probe records the numbers in CI; they are reported, not gated, because SwiftShader timings are noisy.
2. Terrain:
   - Treat it as a ring buffer and compute only the new rows when `baseZ` moves forward one segment.
   - Move day/night and biome tinting into the material (a per-vertex zone attribute plus uniforms), so colours no longer need a CPU rewrite every frame.
   - Recompute normals only for the new rows.
3. **Floating origin:** keep the logical `z` in float64 and offset what gets rendered. This fixes the jitter on long drives. Add an e2e test that teleports to z = −5,000,000.
4. Scenery: one `InstancedMesh` per type with shared geometries. Car: merge static parts per material (about 150 draw calls down to about 12).
5. Lazy-load Tone when Start is clicked, so first paint comes sooner. Add a `size-limit` budget to CI and run Lighthouse CI against the Pages preview.
6. **Gate:** the visual baselines are unchanged, and the debug-overlay numbers in the PR description show a measurable gain.

### Phase 5: Hardening, accessibility and polish

- Fallbacks: a "WebGL unavailable" screen, an audio-start failure message, and a global error overlay.
- Accessibility:
  - Drop `user-scalable=no`; add `aria-label`s and `aria-pressed`.
  - Toasts in a `role="status"` live region.
  - `:focus-visible` styles; limit `user-select:none` to the canvas.
  - `prefers-reduced-motion`: no ping or pulse, slower drone camera.
  - **`@axe-core/playwright` as a gating CI check.**
- Mobile: safe-area insets, a `touch-action` policy, and tests on real devices.
- Remember volume, station and camera between visits (`localStorage`, wrapped in try/catch).
- Settle the name ("Retrowave Roadtrip" for the repo vs "Horizon Drift" in the UI) and use it everywhere: package name, title, README.

---

## Workflow (how quality is guaranteed throughout)

**Branching:** trunk-based. Short-lived branches named `refactor/2.5-radio-composer`, `fix/…` or `perf/…`, one concern per PR, ideally under 400 changed lines. Squash-merge into `main`; Pages deploys `main`.

**Fix as we go, with every change traceable:**

1. Write a failing test that reproduces the bug: `test(input): reproduce stuck key on touchcancel`.
2. Fix it in its own commit: `fix(input): release held keys on pointercancel`.
3. List it under **"Behaviour changes"** in the PR template, and in `CHANGELOG.md` (generated from the Conventional Commits).
4. Visual baselines change only in commits named `test(visual): update baselines — <reason>`, and the reviewer checks the Playwright diff report.

A pure refactor commit never changes a test expectation. If one has to change, the change is a behaviour change and gets its own commit.

**CI gates (all required for merge):**

- `tsc --noEmit` · `eslint --max-warnings 0` · `prettier --check`
- Vitest with coverage thresholds: ≥ 90 % lines on pure modules (`core/`, `sim/`, `world/{noise,road,landforms}`, `audio/composer`). The overall coverage threshold only goes up (ratchet).
- Playwright: smoke, interaction and visual tests, plus axe from Phase 5
- `vite build` plus a `size-limit` budget
- `pnpm audit --prod` (high severity and above)

**Definition of done for each PR** (a checklist in the PR template):

- CI is green.
- New logic has tests.
- No new `any`, `eslint-disable` or `@ts-ignore` without a reason in a comment.
- Behaviour changes are listed.
- ADR added if the change is architectural.
- Manual QA has been done:
  - drive for 2 minutes in every camera
  - cycle all biomes and stations
  - for audio PRs, listen to every station
  - for UI or input PRs, try it on a phone

**Determinism hooks for tests:**

- `?seed=<n>`, `?t=<celestialTime>` and `?freeze` URL parameters.
- `window.__HD__` (store, loop step) exists only in builds where `import.meta.env.MODE !== 'production'`.
- Every random draw goes through `core/rng`.

**Review:** run `/code-review` on each PR before merging. A larger review at each phase boundary.

---

## Critical files

- Source today: `index.html`. It becomes `legacy/index.html` (oracle) and then `index.html` (markup only) plus `src/**`.
- New: `package.json`, `vite.config.ts`, `tsconfig.json`, `eslint.config.js`, `playwright.config.ts`, `vitest.config.ts`, `.github/workflows/{ci,deploy}.yml`, `renovate.json`, `scripts/capture-legacy-fixtures.ts`, `tests/{unit,e2e,fixtures}/`, `docs/adr/`.
- Existing code to reuse as-is when extracting: the noise, road and landform functions (`index.html:1017-1129`), the celestial-weight logic (`index.html:2292-2340`), the composer logic in `CarRadio` (`index.html:654-877`), the shaders (`index.html:1168-1315`), and the car model builder (`index.html:1497-1881`).

## Verification

- `pnpm verify` runs every CI gate locally (typecheck, lint, format, unit, build, e2e).
- `pnpm dev` for manual play. Until the end of Phase 2, `/legacy/` stays available for side-by-side comparison.
- Pure-logic correctness: Vitest checks the extracted functions for exact equality against the JSON fixtures captured from the original code.
- Visual and interaction parity: the Playwright screenshot suite (seeded, fixed clock, SwiftShader in the Playwright container).
- After each phase: the GitHub Pages deploy is live, the manual QA checklist is done on desktop and phone, and the release is tagged.
