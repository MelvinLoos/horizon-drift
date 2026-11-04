# ADR-0003: Testing strategy — legacy oracle, shared visual baselines

- Status: accepted
- Date: 2026-11-03

## Context

The refactor must keep the experience the same while the code is rewritten module by module.

## Decision

1. **Legacy oracle fixtures.** `scripts/capture-legacy-fixtures.ts` loads the untouched
   `legacy/index.html` with a seeded `Math.random` and a paused fake clock, and records:
   pure-function outputs (road, noise, landforms, terrain elevation) and per-frame traces of logic
   that only existed inline (day/night cycle, driving physics). Extracted modules must reproduce
   these JSON files (`tests/fixtures/legacy/`) within a relative tolerance of 1e-9
   (`ORACLE_TOLERANCE`). Bit-exact equality is not achievable: the fixtures come from Chromium and
   the unit tests run in Node, whose V8 builds use different trig routines (Chrome enables
   `use_libm_trig_functions`), so `Math.sin` can differ by 1 ulp, which the noise hash amplifies.
2. **Shared visual baselines.** `tests/e2e/visual.spec.ts` screenshots fixed scenes
   (5 biomes, 3 cameras, 4 sky phases). The baselines were captured from the legacy page and are
   shared by every target (`TARGET=legacy|app`) via a common `window.__HD__` hook contract.
   They are only re-approved deliberately, in a `test(visual): update baselines — <why>` commit.
   **Update (step 2.5):** pixel parity with the prototype was never exact (its Tailwind CDN script
   and a different object count shift the seeded random stream, which changes the asphalt noise)
   and it stayed under the 1 % tolerance only by luck. Step 2.5 corrected the station genre line
   shown before Start, which shifts the radio console layout and pushed three scenes over the
   tolerance. The baselines were therefore re-approved from the app, and from then on only the app
   runs the `@visual` tests; the prototype keeps the functional specs until it is deleted (2.9).
3. **Reproducible rendering.** Visual tests run in the official Playwright Docker image with
   SwiftShader (`scripts/playwright-docker.sh`), locally and in CI.
4. **Known bugs as failing tests.** Reproducible bugs get `test.fail()` specs, so a fix is
   detected automatically and must update the register in `docs/known-bugs.md`.

## Consequences

- SwiftShader is slow (~5 FPS for this scene); visual tests take minutes and are kept to a
  representative matrix rather than every combination.
- The legacy page loads its libraries from CDNs, so oracle/legacy runs need network access.
