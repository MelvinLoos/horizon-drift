# ADR-0001: Stack and tooling

- Status: accepted
- Date: 2026-11-03

## Context

The app was a single 2,586-line `index.html` that loaded Tailwind (Play CDN), three.js r128 and
Tone.js from CDNs at runtime, with no build, types, tests or lint.

## Decision

- **Vite** for dev server and production build, **TypeScript** in strict mode
  (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- **Vanilla TypeScript UI** with a small typed observable store. The HUD is small and the core
  (render + audio loops) is imperative; a framework would add weight without simplifying it.
- **Tailwind CSS v4**, compiled at build time via `@tailwindcss/vite`.
- **pnpm**, **ESLint** (typescript-eslint `strictTypeChecked`), **Prettier**, **Vitest**,
  **Playwright**, **husky + lint-staged**, **commitlint** (Conventional Commits).
- Hosting on **GitHub Pages**, CI on **GitHub Actions**.
- Libraries are first installed from npm at the **same versions** the prototype used
  (three@0.128.0, tone@14.8.49) and upgraded only in Phase 3, one library per PR.

## Constraints

- **TypeScript is pinned to 6.x**: typescript-eslint 8 refuses to run on TypeScript 7
  (typescript-eslint/typescript-eslint#10940). Revisit when it supports TS 7.
- Project agent skills in `.agents/skills/` target **three.js r186**; that is the Phase 3 target.

## Consequences

Every change runs through typecheck, lint, format, unit, e2e and visual gates. A build step is
now required to run the app (`pnpm dev`).
