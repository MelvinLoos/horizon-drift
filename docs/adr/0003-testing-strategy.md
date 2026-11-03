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
   these JSON files (`tests/fixtures/legacy/`).
2. **Shared visual baselines.** `tests/e2e/visual.spec.ts` screenshots fixed scenes
   (5 biomes, 3 cameras, 4 sky phases). The baselines were captured from the legacy page and are
   shared by every target (`TARGET=legacy|app`) via a common `window.__HD__` hook contract.
   They are only re-approved deliberately, in a `test(visual): update baselines — <why>` commit.
3. **Reproducible rendering.** Visual tests run in the official Playwright Docker image with
   SwiftShader (`scripts/playwright-docker.sh`), locally and in CI.
4. **Known bugs as failing tests.** Reproducible bugs get `test.fail()` specs, so a fix is
   detected automatically and must update the register in `docs/known-bugs.md`.

## Consequences

- SwiftShader is slow (~5 FPS for this scene); visual tests take minutes and are kept to a
  representative matrix rather than every combination.
- The legacy page loads its libraries from CDNs, so oracle/legacy runs need network access.
