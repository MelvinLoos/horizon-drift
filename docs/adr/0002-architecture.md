# ADR-0002: Architecture — pure core, thin adapters, one composition root

- Status: accepted
- Date: 2026-11-03

## Context

In the prototype, simulation, rendering, audio, input and UI share ~60 globals; the radio class
writes to the DOM and UI state is changed by assigning Tailwind class strings.

## Decision

- **Pure modules** (`core/`, `config/`, `sim/`, `world/{noise,road,landforms}`, `audio/composer/`)
  never import `three`, `tone` or touch the DOM. All randomness goes through `core/rng`.
- **Adapters** (`world/terrain|sky|scenery`, `vehicle/`, `camera/`, `audio/RadioEngine`, `ui/`,
  `input/`) translate state into three.js / Tone.js / DOM.
- **One-way data flow**: input and UI dispatch actions → store; the sim updates state per tick;
  render, audio and UI subscribe. No module reaches into another module's DOM.
- **`main.ts` is the only composition root**; modules receive dependencies, they do not import
  singletons.
- UI state is expressed with `data-state` / ARIA attributes and CSS, not class-string swaps.

See the module map in [docs/refactor-plan.md](../refactor-plan.md#target-architecture).

## Consequences

Pure logic is unit-testable in Node and can be checked against the legacy oracle fixtures.
Adapters stay small enough that dependency upgrades (Phase 3) touch few files.
